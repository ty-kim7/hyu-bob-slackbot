import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

async function fetchMenu(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
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
          accessory: {
            type: "image",
            image_url: item.imageUrl,
            alt_text: item.name,
          },
        },
        { type: "divider" }
      );
    });
  });

  console.log("Menu data:", blocks);

  await sendToSlack(webhookUrl, blocks);

  console.log("Menu data sent to Slack successfully.");
}

main().catch(console.error);
