import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { json } from "stream/consumers";
import { URLSearchParams } from 'url';

dotenv.config();

async function fetchMenu(url, method = "GET", body = null) {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0",
    };
    let requestBody = body;

    if (method === "POST" && body && typeof body === 'object') {
      requestBody = new URLSearchParams(Object.entries(body)).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Host'] = 'www.hywoman.ac.kr';
      headers['Referer'] = 'https://www.hywoman.ac.kr/ko/cms/FrCon/index.do?MENU_ID=1140';
    }

    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    return html;
  } catch (error) {
    console.error("Error fetching menu:", error);
    throw error;
  }
}

async function parseMenuItems(url, index = 0) {
  const html = await fetchMenu(url);
  const $ = cheerio.load(html);

  const menuItems = [];

  $(".thumbnails")
    .eq(index)
    .find("li")
    .each((_, item) => {
      const name = $(item)
        .find("h3")
        .text()
        .trim()
        .split("\n")[0]
        .replace(/\*/g, "");
      const imageUrl = $(item).find("img").attr("src") || "";
      const price = $(item).find(".price").text().trim();

      if (name && imageUrl && price) {
        menuItems.push({ name, imageUrl, price });
      }
    });

  return menuItems;
}

function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Calculate Monday (start of the week)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust Sunday
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + diffToMonday);

  // Calculate Sunday (end of the week)
  const diffToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + diffToSunday);

  // Calculate defaultDate (endOfWeek - 2 days)
  const defaultDateObj = new Date(endOfWeek); // Start with endOfWeek
  defaultDateObj.setDate(endOfWeek.getDate() - 2); // Subtract 2 days

  // Format date to YYYY.MM.DD
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  return {
    startOfWeek: formatDate(startOfWeek),
    endOfWeek: formatDate(endOfWeek),
    defaultDate: formatDate(defaultDateObj), // Use the new defaultDate calculation
    currentDate: formatDate(today),
  };
}

async function parseHYWUMenuItems(url, index = 0) {
  const { startOfWeek, endOfWeek, defaultDate, currentDate } = getWeekDates();

  const html = await fetchMenu(url, "POST", {
    "startOfWeek": startOfWeek,
    "endOfWeek": endOfWeek,
    "mode": "next",
    "defaultDate": defaultDate,
    "currentDate": currentDate,
  });
  console.log(html);

  const menuItems = [];
  const json = JSON.parse(html);
  
  json["data"]["carte"].filter((item) => item["BISTRO_SEQ"] === index).forEach((item) => {
    menuItems.push({
      name: item["CARTE_CONT"],
      price: index === 1 ? "6,200원" : "5,200원",
      imageUrl: "",
    });
  });

  return menuItems;
}

async function sendToSlack(webhookUrl, blocks) {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
}

async function main() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  const menus = [
    {
      title: "신소재공학관 7층",
      url: "https://www.hanyang.ac.kr/web/www/re4",
      items: await parseMenuItems("https://www.hanyang.ac.kr/web/www/re4", 0),
    },
    {
      title: "생활과학관 7층",
      url: "https://www.hanyang.ac.kr/web/www/re2",
      items: await parseMenuItems("https://www.hanyang.ac.kr/web/www/re2", 0),
    },
    {
      title: "한양플라자 3층",
      url: "https://www.hanyang.ac.kr/web/www/re1",
      items: await parseMenuItems("https://www.hanyang.ac.kr/web/www/re1", 1),
    },
    {
      title: "행원스퀘어 교직원식당",
      url: "https://www.hywoman.ac.kr/ko/cms/FrCon/index.do?MENU_ID=1140",
      items: await parseHYWUMenuItems("https://www.hywoman.ac.kr/ajaxf/FrProgramSvc/getDayFood.do", 1),
    },
    {
      title: "행원스퀘어 학생식당",
      url: "https://www.hywoman.ac.kr/ko/cms/FrCon/index.do?MENU_ID=1140",
      items: await parseHYWUMenuItems("https://www.hywoman.ac.kr/ajaxf/FrProgramSvc/getDayFood.do", 2),
    },
  ];

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${new Date().toLocaleDateString("ko-KR")} 메뉴 정보`,
      },
    },
  ];

  menus.forEach((menu) => {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${menu.title}*`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "홈페이지에서 확인",
          },
          url: menu.url,
        },
      },
      { type: "divider" }
    );

    menu.items.forEach((item) => {
      blocks.push(
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${item.name}*\n가격: ${item.price}` },
        },
        { type: "divider" }
      );
    });
  });

  await sendToSlack(webhookUrl, blocks);

  console.log("Menu data sent to Slack successfully.");
}

main().catch(console.error);
