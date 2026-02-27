


document.addEventListener("DOMContentLoaded", () => {
    
    const hero = document.querySelector(".hero");
    const heroContent = document.querySelector(".hero-content-inner");
    const services = document.querySelector(".services");


    if (!hero || !services) {
        console.log("Missing hero or services.");
        return;
    }

    let heroTop = 0;
    let scrollShift = 0;
    let scrollOpacity = 1;

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    let ticking = false;
    let raf = 0;

    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    const clamp11 = (n) => Math.max(-1, Math.min(1, n));
    const lerp = (a, b, t) => a + (b - a) * t;



    const measure = () => {
      const heroRect = hero.getBoundingClientRect();
      heroTop = heroRect.top + window.scrollY;
      heroHeight = hero.offsetHeight || heroRect.height || 1;
    };

    const applyTransform = () => {
      raf = 0;

      // Smooth follow so it feels “alive” rather than twitchy
      const ease = 0.14;
      currentX = lerp(currentX, targetX, ease);
      currentY = lerp(currentY, targetY, ease);

      heroContent.style.transform = `translate3d(${currentX}px, ${scrollShift + currentY}px, 0)`;
      heroContent.style.transform = `translate3d(${currentX}px, ${scrollShift + currentY}px, 0)`;
      heroContent.style.opacity = String(scrollOpacity);


      // If we’re still chasing the target, keep animating
      if (Math.abs(currentX - targetX) > 0.05 || Math.abs(currentY - targetY) > 0.05) {
        raf = requestAnimationFrame(applyTransform);
      }
    };

    const requestApply = () => {
      if (raf) return;
      raf = requestAnimationFrame(applyTransform);
    };

    const updateScroll = () => {
      ticking = false;

      const y = window.scrollY;
      const p = clamp01((y - heroTop) / heroHeight);

      const maxShift = heroHeight * 0.55;
      scrollShift = -p * maxShift;

      /* NEW: fade out near the end of the sticky span */
      const fadeStart = 0.78; // start fading when 78% through the sticky span
      const fadeT = clamp01((p - fadeStart) / (1 - fadeStart));
      scrollOpacity = 1 - fadeT;

      requestApply();

    };

    const requestTick = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateScroll);
    };

    measure();
    updateScroll();

    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', () => { measure(); requestTick(); }, { passive: true });

});