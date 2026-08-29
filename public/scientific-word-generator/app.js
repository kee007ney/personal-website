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

  if (announce) {
    announcementElement.textContent = `${generated.term}. ${generated.definition}. ${generated.usage}`;
  }
}

function generate(rng, announce) {
  render(generateWord({ lexicon, recipes, rng, previousTerm }), announce);
}

button?.addEventListener("click", () => generate(Math.random, true));

// Keep the first paint deterministic and aligned with the valid HTML fallback.
generate(() => 0, false);
