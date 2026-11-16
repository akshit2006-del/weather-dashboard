// All API addresses live in one place so they are easy to change.
const API = {
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast"
};

const form = document.querySelector("#search");
const input = document.querySelector("#city");
const goBtn = document.querySelector("#go");
const hint = document.querySelector("#hint");
const result = document.querySelector("#result");
let latestRequest = 0; // lets us ignore old responses if the user searches again

class CityNotFound extends Error {}

// ---------- helpers ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent, never innerHTML, for safety
  return node;
}

function describe(code) {
  if (code === 0) return ["Clear sky", "☀️"];
  if (code <= 2) return ["Partly cloudy", "⛅"];
  if (code === 3) return ["Overcast", "☁️"];
  if (code === 45 || code === 48) return ["Fog", "🌫️"];
  if (code >= 51 && code <= 57) return ["Drizzle", "🌦️"];
  if (code >= 61 && code <= 67) return ["Rain", "🌧️"];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["Snow", "❄️"];
  if (code >= 80 && code <= 82) return ["Rain showers", "🌧️"];
  if (code >= 95) return ["Thunderstorm", "⛈️"];
  return ["Unknown", "🌡️"];
}

function validate(value) {
  const text = value.trim();
  if (!text) return "Please type a city name.";
  if (text.length < 2) return "That city name is too short.";
  if (!/^[\p{L}\s.,'-]+$/u.test(text)) return "Use letters only, without numbers or symbols.";
  return "";
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("HTTP " + response.status); // always check response.ok first
  return response.json();
}

// ---------- screen states ----------
function showLoading() {
  result.replaceChildren(el("p", "loading", "Loading weather…"));
  goBtn.disabled = true;
}

function showError(message) {
  result.replaceChildren(el("p", "error", message));
}

function showWeather(place, data) {
  const [text, icon] = describe(data.current.weather_code);
  const card = el("div", "current");
  const title = el("div", "place", place.name);
  title.append(el("small", "", [place.admin1, place.country].filter(Boolean).join(", ")));

  const now = el("div", "now");
  const info = el("div");
  info.append(el("div", "temp", Math.round(data.current.temperature_2m) + "°C"), el("div", "cond", text));
  now.append(el("div", "icon", icon), info);

  const stats = el("div", "stats");
  [
    ["Feels like", Math.round(data.current.apparent_temperature) + "°C"],
    ["Humidity", data.current.relative_humidity_2m + "%"],
    ["Wind", Math.round(data.current.wind_speed_10m) + " km/h"]
  ].forEach(([label, value]) => {
    const box = el("div", "stat");
    box.append(el("span", "", label), el("b", "", value));
    stats.append(box);
  });
  card.append(title, now, stats);

  const days = el("div", "days");
  data.daily.time.forEach((date, i) => {
    const [, dayIcon] = describe(data.daily.weather_code[i]);
    const label = i === 0 ? "Today" : new Date(date + "T00:00").toLocaleDateString("en-IN", { weekday: "short" });
    const box = el("div", "day");
    box.append(
      el("div", "d", label),
      el("div", "i", dayIcon),
      el("div", "hi", Math.round(data.daily.temperature_2m_max[i]) + "°"),
      el("div", "lo", Math.round(data.daily.temperature_2m_min[i]) + "°")
    );
    days.append(box);
  });

  result.replaceChildren(card, el("h2", "", "5-day forecast"), days);
}

// ---------- main search ----------
async function search(name) {
  const requestId = ++latestRequest;
  showLoading();
  try {
    const geo = await getJSON(`${API.geocode}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
    if (!geo.results || geo.results.length === 0) throw new CityNotFound();
    const place = geo.results[0];
    const url = `${API.forecast}?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5";
    const data = await getJSON(url);
    if (requestId !== latestRequest) return;
    showWeather(place, data);
  } catch (error) {
    if (requestId !== latestRequest) return;
    if (error instanceof CityNotFound) {
      showError(`We couldn’t find “${name}”. Check the spelling and try again.`);
    } else if (error instanceof TypeError) {
      showError("Can’t reach the weather service. Check your internet connection and try again.");
    } else {
      showError("The weather service had a problem. Please try again in a moment.");
    }
  } finally {
    if (requestId === latestRequest) goBtn.disabled = false;
  }
}

// ---------- events ----------
form.addEventListener("submit", event => {
  event.preventDefault();
  const problem = validate(input.value);
  hint.textContent = problem;
  input.setAttribute("aria-invalid", String(Boolean(problem)));
  if (!problem) search(input.value.trim()); // the API is only called on submit, not on every key press
});

let timer;
input.addEventListener("input", () => { // debounced: checks the text only after the user pauses typing
  clearTimeout(timer);
  timer = setTimeout(() => {
    const problem = input.value ? validate(input.value) : "";
    hint.textContent = problem;
    input.setAttribute("aria-invalid", String(Boolean(problem)));
  }, 400);
});
