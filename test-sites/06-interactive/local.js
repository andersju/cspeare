window.addEventListener("load", (event) => {
  const form = document.getElementById("testForm");
  const formStatus = document.getElementById("formStatus");
  form.addEventListener("submit", (event) => {
    formStatus.textContent = "Form submitted!";
  });

  const catButton = document.getElementById("catbutton");
  const catDiv = document.getElementById("cat");
  catButton.addEventListener("click", () => {
      const img = document.createElement("img");
      img.src = "https://x.unix.se/etc/melon_cat.jpg";
      catDiv.appendChild(img);
  });

  const linuxButton = document.getElementById("linuxbutton");
  const linuxDiv = document.getElementById("linuxtags");
  linuxbutton.addEventListener("click", () => {
    const ul = document.createElement("ul");

    fetchTags().then(data => {
      for (const tag of data) {
        const li = document.createElement("li");
        li.textContent = `${tag.name}: ${tag.tarball_url}`;
        ul.appendChild(li);
      }

      linuxDiv.appendChild(ul);
    });
  });
});

async function fetchTags() {
  try {
    const response = await fetch('https://api.github.com/repos/torvalds/linux/tags');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    console.log(data);
    return data;
  } catch (error) {
    console.error(`Error getting data: ${error}`);
  }
}
