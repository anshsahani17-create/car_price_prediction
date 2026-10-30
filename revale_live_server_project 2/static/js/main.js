(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const form = $("#estimateForm");
  if (!form) return;

  const brand = $("#brand");
  const model = $("#model");
  const pages = $$(".form-page");
  const error = $("#formError");
  const resultPanel = $("#resultPanel");
  const submitBtn = $("#submitBtn");
  let page = 1;
  let scrollTicking = false;

  // IntersectionObserver fallback ensures content is still visible in older browsers.
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(el => revealObserver.observe(el));
  } else {
    $$(".reveal").forEach(el => el.classList.add("visible"));
  }

  const hero = $("#heroVisual");
  const car = $("#heroCar");
  if (hero && car && "requestAnimationFrame" in window) {
    window.addEventListener("scroll", () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const viewport = window.innerHeight || 1;
        const progress = Math.max(-1, Math.min(1, (viewport * .55 - rect.top) / (viewport + rect.height)));
        const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduceMotion) car.style.transform = `translate(${progress * 10}px, ${8 - progress * 10}px) rotate(${progress * -.45}deg)`;
        scrollTicking = false;
      });
    }, { passive: true });
  }

  function haptic(pattern = 8) {
    try {
      if ("vibrate" in navigator && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    } catch (_) { /* Haptics are optional and not supported by all browsers. */ }
  }
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("button, .button, .nav-cta")) haptic(8);
  });

  function showPage(next) {
    page = next;
    pages.forEach(p => p.classList.toggle("active", Number(p.dataset.page) === page));
    const label = $("#stepLabel");
    const progress = $(".progress-track span");
    if (label) label.textContent = page === 1 ? "01 — 02" : "02 — 02";
    if (progress) progress.style.width = page === 1 ? "50%" : "100%";
    error.textContent = "";
    if (page === 2) haptic([10, 25, 10]);
  }

  function validatePageOne() {
    for (const name of ["brand", "model", "year", "km_driven"]) {
      const input = form.elements.namedItem(name);
      if (!input || !input.value || !input.checkValidity()) {
        if (input && typeof input.reportValidity === "function") input.reportValidity();
        else error.textContent = "Please complete the required car details.";
        return false;
      }
    }
    return true;
  }

  function fillModels(selectedBrand) {
    model.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = selectedBrand ? "Choose model" : "Choose brand first";
    model.appendChild(placeholder);
    const choices = (window.MODELS_BY_BRAND || {})[selectedBrand] || [];
    choices.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      model.appendChild(option);
    });
    model.disabled = !selectedBrand || choices.length === 0;
    if (selectedBrand && choices.length === 0) placeholder.textContent = "No models available";
  }

  $("#nextBtn").addEventListener("click", () => {
    if (validatePageOne()) showPage(2);
  });
  $("#backBtn").addEventListener("click", () => showPage(1));
  brand.addEventListener("change", () => {
    fillModels(brand.value);
    haptic(8);
  });
  model.addEventListener("change", () => haptic(6));

  function formatINR(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not available";
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }).format(amount);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    if (!form.reportValidity()) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Calculating <span class="spinner" aria-hidden="true">↻</span>';
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      let data;
      try {
        const response = await fetch("/api/estimate", {
          method: "POST",
          headers: {"Content-Type": "application/json", "Accept": "application/json"},
          body: JSON.stringify(payload)
        });
        try { data = await response.json(); }
        catch (_) { throw new Error("The server returned an unexpected response."); }
        if (!response.ok || !data.ok) throw new Error(data.error || "Couldn't calculate this estimate.");
      } catch (apiError) {
        // Live Server has no Flask API. Use a clearly labelled frontend demo estimate.
        // This is not an ML prediction or a real market valuation.
        const year = Number(payload.year);
        const km = Number(payload.km_driven);
        const cc = Number(payload.engine_cc || 1200);
        const brandFactors = {
          "Maruti Suzuki": 1.0, "Hyundai": 1.08, "Tata": 1.02,
          "Mahindra": 1.18, "Honda": 1.08, "Toyota": 1.25,
          "Kia": 1.12, "Renault": 0.88, "Volkswagen": 1.05,
          "Skoda": 1.08, "Ford": 0.82, "MG": 1.10, "Jeep": 1.35,
          "BMW": 1.65, "Mercedes-Benz": 1.8, "Audi": 1.65, "Other": 0.9
        };
        const modelFactors = {
          "Nano": 0.45, "Alto": 0.7, "Swift": 1.0, "Baleno": 1.08,
          "Nexon": 1.15, "Safari": 1.55, "Thar": 1.6,
          "Scorpio N": 1.55, "XUV700": 1.65, "Fortuner": 2.2,
          "Creta": 1.35, "City": 1.2, "Compass": 1.5,
          "3 Series": 1.8, "X5": 2.2, "A6": 1.8, "Q7": 2.2
        };
        const age = Math.max(0, new Date().getFullYear() - year);
        let priceLakh = (1.3 + cc / 1000 * 1.05) * (brandFactors[payload.brand] || 1) * (modelFactors[payload.model] || 1);
        priceLakh *= Math.max(0.18, 1 - age * 0.085);
        priceLakh *= Math.max(0.45, 1 - km / 250000 * 0.35);
        if (payload.fuel === "Diesel") priceLakh *= 1.04;
        if (payload.transmission === "Automatic") priceLakh *= 1.06;
        const owners = {"First owner": 1, "Second owner": 0.93, "Third owner": 0.85, "Fourth or more": 0.76, "Fourth owner or more": 0.76};
        priceLakh *= owners[payload.owner] || 1;
        const price = Math.round(Math.max(35000, Math.min(priceLakh * 100000, 25000000)));
        data = {
          ok: true, price, low: Math.round(price * 0.9), high: Math.round(price * 1.1), age,
          note: "DEMO ESTIMATE ONLY (Live Server mode). This is a simple frontend formula, not a machine-learning prediction or verified market price. Run Flask for the model-based estimate."
        };
      }

      $("#resultPrice").textContent = formatINR(data.price);
      $("#resultRange").textContent = `${formatINR(data.low)} to ${formatINR(data.high)}`;
      $("#resultNote").textContent = `${data.age} year(s) old. ${data.note}`;
      form.hidden = true;
      $(".form-progress").hidden = true;
      $(".progress-track").hidden = true;
      resultPanel.hidden = false;
      haptic([15, 35, 15]);
      resultPanel.scrollIntoView({behavior: "smooth", block: "center"});
    } catch (err) {
      error.textContent = err && err.message ? err.message : "Something went wrong. Please try again.";
      haptic([35, 30, 35]);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Estimate value <span>↗</span>';
    }
  });

  $("#resetBtn").addEventListener("click", () => {
    form.reset();
    fillModels("");
    form.hidden = false;
    $(".form-progress").hidden = false;
    $(".progress-track").hidden = false;
    resultPanel.hidden = true;
    showPage(1);
    $("#estimate").scrollIntoView({behavior: "smooth", block: "start"});
  });

  fillModels("");
})();
