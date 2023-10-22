//DO NOT TOUCH UNLESS YOU KNOW WHAT YOUR DOING!!
import { Ai } from './vendor/@cloudflare/ai.js';

//ID generator
function uuid() {
  let uuid = '';
  const chars = 'abcdef0123456789';
  for (let i = 0; i < 32; i++) {
    const charIndex = Math.floor(Math.random() * chars.length);
    uuid += chars[charIndex];
    if (i === 7 || i === 11 || i === 15 || i === 19) {
      uuid += '-';
    }
  }
  return uuid;
}

//creating new map for chat messages
const chats = new Map();

// ------------------ CONFIG ------------------ //

//Messages stored, dont go over 5 since if history too large AI returns null
const maxMemory = 3; 
//give your AI a prompt for specific instructions if you want to fine-tune
const preprompt = "You are a helpful and responsive assistant, you answer questions directly and provide instruction unless told otherwise.";
//Max number of requests allowed per-ID, ex: https://your-api.com/[ID], will be improved later
const maxRequest = 100;
//DO NOT TOUCH UNLESS YOU KNOW WHAT YOUR DOING!!
const ai_model = "@cf/meta/llama-2-7b-chat-int8";
//Timezome for req_time, set to your timezone of choice
const timezone = "en-US";

// --------------- END OF CONFIG --------------- //

export default {
  async fetch(request, env) {
    //defining variables
    const tasks = [];
    const url = new URL(request.url);
    const query = decodeURIComponent(url.searchParams.get('q'));
    const id = url.pathname.substring(1);
    const ai = new Ai(env.AI);
    //CORS headers & Json, modify if you know what your doing.
    const jsonheaders = {
      "content-type": "application/json;charset=UTF-8",
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    //defining time & getting client IP via cloudflare
    let client_ip = request.headers.get("CF-Connecting-IP");
    let req_time = new Date().toLocaleTimeString(timezone, {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    });
    
    //if user does not supply ID, make one.
    if (!id) {
      const newId = uuid();
      const newUrl = `${url.origin}/${newId}`;
      return Response.redirect(newUrl, 301);
    }

    let chat = chats.get(id);

    //chat JSON.
    if (!chat) {
      chat = {
        messages: [],
        userId: id,
        messageCount: 0,
        client: {
          ip: client_ip,
          used_req: 0,
          max_req: maxRequest,
          req_time: req_time
        },
      };
      chats.set(id, chat);
      chat.messages.push({ role: 'system', content: preprompt });
      tasks.push({ inputs: chat, response: chat.messages });
    }

    //update variables per-request
    chat.client.ip = client_ip;
    chat.client.req_time = req_time;


    //if no query is supplied return messages
    if (!query) {
      tasks.push({ inputs: chat, response: chat.messages });
      return new Response(JSON.stringify(tasks), {
        headers: jsonheaders,
      });
    }

    //if user visits ex: https://your-api.com/api
    if (id == "api") {
      const info = {
        URL: url,
        AI: ai_model,
        TIMEZONE: timezone,
        REQUEST_TIME: req_time,
        CLIENT_IP: client_ip,
        GITHUB: 'https://github.com/localuser-isback/Cloudflare-AI' //keep if epic.
      };
      return new Response(JSON.stringify(info), {
        headers: jsonheaders,
      });
    }

    //if query is null or undefined return messages
    if (query === "null" || query == undefined) {
      tasks.push({ inputs: chat, response: chat.messages });
      return new Response(JSON.stringify(tasks), {
        headers: jsonheaders,
      });
    } else {
      //ratelimit & user messages
      chat.messages.push({ role: 'user', content: query });
      chat.messageCount += 1;
      chat.client.used_req += 1;

      //removes previous messages but 1 when max memory reached
      if (chat.messageCount >= maxMemory + 1) {
        chat.messages = chat.messages.slice(-2);
        chat.messageCount = 0;
      }

      //ratelimit check
      if (chat.client.used_req >= maxRequest) {
        //return api error
        const error_page = {
          role: 'API',
          content: "[Error]: Ratelimit activated, no more than " + maxRequest + " Per requests ID. IP: " + client_ip,
        };
        const json = JSON.stringify(error_page, null, 2);
        return new Response(json, {
          headers: jsonheaders,
        });
      }

      //send data to AI and return response
      let response = await ai.run(ai_model, chat);
      chat.messages.push({ role: 'system', content: response });
    }


    //update and return new data
    tasks.push({ inputs: chat, response: chat.messages });

    return new Response(JSON.stringify(tasks), {
      headers: jsonheaders,
    });
  },
};
