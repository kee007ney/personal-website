import { CATEGORY_LABELS, lexicon, recipes } from "./data.js";
import { generateWord } from "./generator.js";

const categoryElement = document.querySelector("#generated-category");
const termElement = document.querySelector("#generated-term");
const definitionElement = document.querySelector("#generated-definition");
const usageElement = document.querySelector("#generated-usage");
const messageElement = document.querySelector("#generator-message");
const announcementElement = document.querySelector("#generator-announcement");
const button = document.querySelector("#randomize-word");

let previousTerm = null;
const MIN_TERM_FONT_SIZE = 20;

function fitTermToLine() {
  termElement.style.removeProperty("font-size");

  const availableWidth = termElement.clientWidth;
  const renderedWidth = termElement.scrollWidth;
  if (!availableWidth || renderedWidth <= availableWidth) return;

  const defaultSize = Number.parseFloat(getComputedStyle(termElement).fontSize);
  const fittedSize = Math.max(
    MIN_TERM_FONT_SIZE,
    Math.floor(defaultSize * (availableWidth / renderedWidth) * 98) / 100,
  );
  termElement.style.fontSize = `${fittedSize}px`;
}


function showFailure() {
  categoryElement.hidden = true;
  termElement.hidden = true;
  definitionElement.hidden = true;
  usageElement.hidden = true;
  messageElement.hidden = false;
  button.disabled = true;
}

function render(result, announce = false) {
  if (!result.ok) {
    showFailure();
    return;
  }

  const generated = result.value;
  categoryElement.hidden = false;
  termElement.hidden = false;
  definitionElement.hidden = false;
  usageElement.hidden = false;
  messageElement.hidden = true;
  categoryElement.textContent = CATEGORY_LABELS[generated.category] || "Coinage";
  termElement.textContent = generated.term;
  definitionElement.textContent = generated.definition;
  usageElement.textContent = generated.usage;
  previousTerm = generated.term;
  requestAnimationFrame(fitTermToLine);

  if (announce) {
    announcementElement.textContent = `${generated.term}. ${generated.definition}. ${generated.usage}`;
  }
}

function generate(rng, announce) {
  render(generateWord({ lexicon, recipes, rng, previousTerm }), announce);
}

button?.addEventListener("click", () => generate(Math.random, true));
window.addEventListener("resize", () => requestAnimationFrame(fitTermToLine));
document.fonts?.ready.then(() => requestAnimationFrame(fitTermToLine));

// Keep the first paint deterministic and aligned with the valid HTML fallback.
generate(() => 0, false);
