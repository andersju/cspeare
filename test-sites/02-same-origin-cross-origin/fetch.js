window.addEventListener("load", (event) => {
    const linuxDiv = document.getElementById("linuxTags");
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
