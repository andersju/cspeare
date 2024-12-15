fetch('https://api.github.com/repos/torvalds/linux/tags')
  .then(response => {
    if (!response.ok) {
      console.log(`Error getting data: ${response.status}`)
    }
    return response.json();
  })
  .then(tags => {
    if (tags.length === 0) {
      console.log('No tags found.');
    }
    console.log(`Latest tagged Linux kernel: ${tags[0].name}`)
  })
  .catch(error => {
    console.error('There was an error fetching the data:', error);
  });
