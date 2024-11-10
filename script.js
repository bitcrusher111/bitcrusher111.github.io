fetch('/navbar.html') // Access navbar.html from the root directory
    .then(response => response.text())
    .then(html => {
        document.getElementById('navbar').innerHTML = html;

        // Get the current page URL
        let currentPage = window.location.href;

        // Get all navigation links
        let navLinks = document.querySelectorAll('#navbar a');

        // Loop through each navigation link
        navLinks.forEach(link => {
            // Get the link's URL
            let linkUrl = new URL(link.href);

            // Add the active class to the link if it matches the current page URL or if it's a link to the root directory
            if (linkUrl.href === currentPage || (linkUrl.pathname === '/' && currentPage.endsWith('index.js'))) {
                link.classList.add('active');
            }
        });
    })
    .catch(error => {
        console.error('Error fetching navigation bar:', error);
    });



document.addEventListener('DOMContentLoaded', function() {
const thumbnails = document.querySelectorAll('.thumbnails img');
const mainImg = document.getElementById('mainImg');

thumbnails.forEach(thumbnail => {
    thumbnail.addEventListener('click', function() {
    mainImg.src = this.src;
    mainImg.alt = this.alt;
    });
});
});