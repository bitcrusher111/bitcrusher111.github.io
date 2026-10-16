document.addEventListener('DOMContentLoaded', function () {
  // highlight the current page in the navbar
  document.querySelectorAll('.navbar a').forEach(function (link) {
    if (link.href === window.location.href) link.classList.add('active');
  });

  // phones: the menu button opens and closes the navbar links
  const navbar = document.querySelector('.navbar');
  const menuButton = document.querySelector('.menu-button');
  if (navbar && menuButton) {
    const setOpen = function (open) {
      navbar.classList.toggle('open', open);
      menuButton.setAttribute('aria-expanded', open);
      menuButton.textContent = open ? 'close' : 'menu';
    };
    menuButton.addEventListener('click', function () { setOpen(!navbar.classList.contains('open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  // dates: move events that have passed since the last build to "past events"
  const upcoming = document.getElementById('dates-upcoming');
  const past = document.getElementById('dates-past');
  if (upcoming && past) {
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    Array.from(upcoming.children).forEach(function (li) {
      if (li.dataset.date < today) past.prepend(li);
    });
  }
});
