document.addEventListener('DOMContentLoaded', function () {
  // highlight the current page in the navbar
  document.querySelectorAll('.navbar a').forEach(function (link) {
    if (link.href === window.location.href) link.classList.add('active');
  });

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
