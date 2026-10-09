// Browser code. Session tokens live only in memory, never in the HTML or localStorage.
const $ = id => document.getElementById(id);
let token = '', next = null, busy = false, generation = 0;
const imageURLs = new Set();
const message = text => { $('status').textContent = text; };
function clearImages() {
  for (const url of imageURLs) URL.revokeObjectURL(url);
  imageURLs.clear(); $('photos').replaceChildren();
}
function signOut() {
  generation++; token = ''; next = null; clearImages();
  $('library').hidden = true; $('login-panel').hidden = false;
  $('photo').value = ''; $('password').value = '';
}
function controls(disabled) {
  busy = disabled;
  for (const button of document.querySelectorAll('button')) button.disabled = disabled;
}
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: {...options.headers, ...(token ? {Authorization: `Bearer ${token}`} : {})}});
  if (!response.ok) {
    let error; try { error = await response.json(); } catch {}
    if (response.status === 401 && token) signOut();
    throw Error(error?.error || `Request failed (${response.status}).`);
  }
  return response;
}
async function load(append = false) {
  const run = generation;
  if (!append) { clearImages(); next = null; }
  const page = await (await api('/api/photos?offset=' + (append ? next : 0))).json();
  if (run !== generation) return;
  next = page.next;
  // Sequential fetches keep a small gallery from creating a burst of requests.
  for (const photo of page.photos) {
    const response = await api('/api/photos/' + encodeURIComponent(photo.name));
    const blob = await response.blob();
    if (run !== generation) return;
    const url = URL.createObjectURL(blob); imageURLs.add(url);
    const figure = document.createElement('figure');
    const img = document.createElement('img'); img.src = url; img.alt = 'Your uploaded photo';
    const caption = document.createElement('figcaption');
    caption.textContent = 'Uploaded ' + new Date(photo.created_at).toLocaleDateString();
    figure.append(img, caption); $('photos').append(figure);
  }
  $('empty').hidden = $('photos').childElementCount > 0;
  $('more').hidden = next === null;
}
async function action(fn) {
  if (busy) return;
  controls(true); message('Working…');
  try { await fn(); } catch (error) { message(error.message); }
  finally { controls(false); }
}
$('login-form').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const response = await api('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: $('email').value, password: $('password').value})});
    token = (await response.json()).access_token; generation++;
    $('password').value = ''; $('login-panel').hidden = true; $('library').hidden = false;
    await load(); message('Signed in. Your photos are private to this account.');
  });
};
$('upload-form').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const file = $('photo').files[0];
    if (!file || file.size > 1_000_000) throw Error('Choose a photo no larger than 1 MB.');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Choose a JPEG, PNG, or WebP photo.');
    await api('/api/photos', {method: 'POST', headers: {'Content-Type': file.type}, body: file});
    $('photo').value = '';
    try { await load(); message('Photo uploaded. Keep a backup of your original.'); }
    catch (error) { message('Upload succeeded, but the gallery could not refresh: ' + error.message); }
  });
};
$('refresh').onclick = () => action(async () => { await load(); message('Photos refreshed.'); });
$('more').onclick = () => action(async () => { await load(true); message('More photos loaded.'); });
$('logout').onclick = () => { signOut(); message('Signed out of this page.'); };
