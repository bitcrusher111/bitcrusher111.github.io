document.addEventListener('DOMContentLoaded', function () {
  // highlight the current page in the navbar
  document.querySelectorAll('.navbar a').forEach(function (link) {
    if (link.href === window.location.href) link.classList.add('active');
  });

  // project photo gallery: arrows and arrow keys
  const gallery = document.querySelector('.theater-gallery[data-images]');
  if (gallery) {
    const images = JSON.parse(gallery.dataset.images);
    const img = gallery.querySelector('img');
    const left = gallery.querySelector('.gallery-arrow-left');
    const right = gallery.querySelector('.gallery-arrow-right');
    let index = 0;
    const show = function (i) {
      if (i < 0 || i >= images.length) return;
      index = i;
      img.src = images[index];
      if (left) left.style.opacity = index > 0 ? '1' : '0.3';
      if (right) right.style.opacity = index < images.length - 1 ? '1' : '0.3';
    };
    if (left) left.addEventListener('click', function () { show(index - 1); });
    if (right) right.addEventListener('click', function () { show(index + 1); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    show(0);
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
