import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { createReadStream } from "fs";
import { intro, outro, multiselect, isCancel, cancel } from "@clack/prompts";
import { createServer } from "http";
import { pipeline } from "stream";

main();
async function main() {
  intro(`survur - a fileserver`);
  const currentDirectory = await fs.readdir(`./`);
  const folders = (
    await Promise.all(
      currentDirectory.map(async (a) => {
        const isDir = (await fs.lstat(a)).isDirectory();

        return isDir ? a : "";
      })
    )
  ).filter(Boolean);

  const selectedFolderOptions = folders.map((path) => {
    return {
      value: `/${path}`,
      label: `/${path}`,
    };
  });
  const foldersToHostOptions = [
    { value: "/", label: "./ (root)" },
    ...selectedFolderOptions,
  ];

  const urlPaths = await multiselect({
    message: "Hey, which folders you wanna host?",
    options: foldersToHostOptions,
  });

  if (isCancel(urlPaths)) {
    cancel("Oh, okay. Goodbye");
    process.exit(0);
  }

  createServer(async (req, res) => {
    try {
      console.log("GET", req.url);
      const requestPath = req.url ?? "/";

      const isValid = urlPaths.some((path) => requestPath.startsWith(path));

      const requestPathOnDisk = `.${decodeURIComponent(requestPath)}`;
      const exists = fsSync.existsSync(requestPathOnDisk);

      if (!isValid && requestPath === "/") {
        // handle request for `/` but not serving
        const data = await getFolderData(requestPath);
        const validData = data.filter((d) =>
          urlPaths.some((urlPath) => {
            return d.path.startsWith(urlPath);
          })
        );
        const html = validData.map((d) => {
          const { url, name } = d;
          return `<li><a href="${url}"> ${name}</a></li>`;
        });

        res.writeHead(200, {
          "content-type": "text/html",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(wrapHtml(requestPathOnDisk, `<ul>${html.join("")}</ul>`));
        res.end();
        return;
      }

      if (!isValid || !exists) {
        console.log(requestPath, "no match", urlPaths, { exists });
        res.writeHead(404, {
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
        return;
      }

      const isDir = (await fs.lstat(requestPathOnDisk)).isDirectory();
      if (isDir) {
        const data = await getFolderData(requestPath);
        const html = data.map((d) => {
          const { url, name } = d;
          return `<li><a href="${url}"> ${name}</a></li>`;
        });
        res.writeHead(200, {
          "content-type": "text/html",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(wrapHtml(requestPath, `<ul>${html.join("")}</ul>`));
        res.end();
        return;
      }

      pipeline(createReadStream(requestPathOnDisk), res, (err) => {
        if (err) {
          console.error("oh no!", err);
        }
      });

      return;
    } catch (err) {
      console.error(err);
      res.writeHead(500, {
        "content-type": "text/html",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(wrapHtml("Oh no...", `<pre>${err.toString()}</pre>`));
      res.end();
    }
  }).listen(3000, "0.0.0.0");

  outro(`folders now served on http://localhost:3000`);
}
async function getFolderData(requestPath) {
  const currentDirectory = await fs.readdir(
    decodeURIComponent(`.${requestPath}`)
  );
  const data = await Promise.all(
    currentDirectory.map(async (fileName) => {
      const pathOnDisk = decodeURIComponent(
        path.join(`.${requestPath}`, fileName)
      );
      const urlPath = `http://localhost:3000${path.join(
        `${requestPath}`,
        fileName
      )}`;

      return {
        path: `/${pathOnDisk}`,
        name: fileName,
        url: urlPath,
        isDir: (await fs.lstat(pathOnDisk)).isDirectory(),
      };
    })
  );
  return data;
}

function wrapHtml(heading, bodyContent) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Survur</title>
  </head>
  <body>
  <h1>${heading}</h1>
    ${bodyContent}
  </body>
  </html>`;
}
