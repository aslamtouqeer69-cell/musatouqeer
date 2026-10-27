
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // Load portfolio projects from the SQLite database API
  async function loadPortfolioProjects() {
    const grid = document.getElementById("projectsGrid");
    const count = document.querySelector(".work-count");

    if (!grid) return;

    try {
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error("Could not load projects");
      }

      const result = await response.json();
      const projects = result.projects || [];

      if (count) {
        count.textContent =
          `PROJECTS / ${String(projects.length).padStart(2, "0")}`;
      }

      if (projects.length === 0) {
        grid.textContent = "Projects will be added soon.";
        return;
      }

      const fragment = document.createDocumentFragment();

      projects.forEach((project, index) => {
        const category = String(project.category || "PROJECT");
        const categoryLower = category.toLowerCase();

        const artClass = categoryLower.includes("seo")
          ? "art-three"
          : categoryLower.includes("content")
            ? "art-two"
            : "art-one";

        const card = document.createElement("article");
        card.className = "project-card";

        const art = document.createElement("div");
        art.className = `project-art ${artClass}`;

        const artLabel = document.createElement("span");
        artLabel.className = "art-label";
        artLabel.textContent =
          `${String(index + 1).padStart(2, "0")} — ${category.toUpperCase()}`;

        const artWord = document.createElement("div");
        artWord.className = "art-word";
        artWord.textContent = String(project.title || "Untitled Project");

        const artBottom = document.createElement("span");
        artBottom.className = "art-bottom";
        artBottom.textContent = "DESIGNED • BUILT • IMPROVED";

        art.append(artLabel, artWord, artBottom);

        const info = document.createElement("div");
        info.className = "project-info";

        const details = document.createElement("div");

        const type = document.createElement("span");
        type.className = "project-type";
        type.textContent = category.toUpperCase();

        const title = document.createElement("h3");
        title.textContent = String(project.title || "Untitled Project");

        details.append(type, title);

        const arrow = document.createElement("span");
        arrow.className = "project-arrow";
        arrow.textContent = "↗";

        info.append(details, arrow);

        const description = document.createElement("p");
        description.textContent = String(
          project.desc || "Project details coming soon."
        );

        const status = document.createElement("span");
        status.className = "project-status";
        status.textContent = "Portfolio project";

        card.append(art, info, description, status);
        fragment.append(card);
      });

      grid.replaceChildren(fragment);
    } catch (error) {
      console.error("Portfolio projects could not load:", error);
    }
  }

  loadPortfolioProjects();

  // Mobile navigation menu
  const menuToggle = document.getElementById("menuToggle");
  const nav = document.getElementById("nav");

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("active");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );
      menuToggle.textContent = isOpen ? "✕" : "☰";
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation");
        menuToggle.textContent = "☰";
      });
    });
  }

  // Automatically update the footer year
  const year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // Pricing buttons: select the relevant project type
  const projectType = document.getElementById("projectType");
  const message = document.getElementById("message");

  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      const plan = button.dataset.plan;

      if (projectType) {
        const options = Array.from(projectType.options);
        const matchingOption = options.find((option) =>
          option.text.toLowerCase().includes(
            plan.toLowerCase().includes("landing")
              ? "landing"
              : plan.toLowerCase().includes("personal")
                ? "personal"
                : "something else"
          )
        );

        if (matchingOption) {
          projectType.value = matchingOption.value;
        }
      }

      if (message && !message.value.trim()) {
        message.value = `Hi Musa, I'm interested in your ${plan} service. Please share more details.`;
      }
    });
  });

  // Contact form
  const contactForm = document.getElementById("contactForm");
  const formMessage = document.getElementById("formMessage");
  const submitButton = contactForm?.querySelector(
    'button[type="submit"]'
  );

  if (contactForm) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!contactForm.reportValidity()) return;

      const originalButtonText = submitButton?.textContent;

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
      }

      if (formMessage) {
        formMessage.textContent = "";
        formMessage.className = "form-message";
      }

      const formData = new FormData(contactForm);

      const enquiry = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        projectType: String(formData.get("projectType") || ""),
        budget: String(formData.get("budget") || "Not decided"),
        message: String(formData.get("message") || "").trim()
      };

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(enquiry)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error ||
            "The server could not accept your enquiry. Please try again."
          );
        }

        if (formMessage) {
          formMessage.textContent =
            "Thank you! Your enquiry has been submitted successfully.";
          formMessage.classList.add("success");
        }

        contactForm.reset();
      } catch (error) {
        console.error("Contact form error:", error);

        if (formMessage) {
          formMessage.textContent =
            "The backend is not connected yet. Your enquiry was not saved. Please contact Musa directly using WhatsApp or email.";
          formMessage.classList.add("error");
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            originalButtonText || "Send Project Enquiry ↗";
        }
      }
    });
  }

  // Smooth scrolling for internal links
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;

      const target = document.querySelector(targetId);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        if (history.replaceState) {
          history.replaceState(null, "", targetId);
        }
      }
    });
  });
});
