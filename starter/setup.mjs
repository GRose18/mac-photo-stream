import {createInterface} from 'node:readline/promises';
import {readFile, writeFile} from 'node:fs/promises';
import {stdin, stdout} from 'node:process';
const terminal = createInterface({input: stdin, output: stdout});
try {
  console.log('This saves public project settings only. Do not paste passwords or secret keys.');
  const name = (await terminal.question('Website address name (lowercase letters, numbers, hyphens): ')).trim();
  if (!/^[a-z][a-z0-9-]{2,50}$/.test(name)) throw Error('Choose a name such as my-family-gallery (3–51 characters).');
  const url = (await terminal.question('Supabase Project URL (https://…supabase.co): ')).trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw Error('Paste the Project URL, not a dashboard address or API key.');
  const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  config.name = name;
  config.vars.SUPABASE_URL = url;
  await writeFile(new URL('./wrangler.jsonc', import.meta.url), JSON.stringify(config, null, 2) + '\n');
  console.log('Saved. Bucket name stays gallery. Next: follow the README to deploy and add your publishable key.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { terminal.close(); }
