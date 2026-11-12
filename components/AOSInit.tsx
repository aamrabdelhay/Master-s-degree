'use client';

import { useEffect } from 'react';
import 'aos/dist/aos.css';

/**
 * تشغيل مكتبة AOS (نفس تأثير الظهور في الملف المرجعي).
 * فيه شبكة أمان بتضمن إن الكروت تظهر حتى لو المكتبة ما اشتغلتش لأي سبب.
 */
export default function AOSInit() {
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    let refreshHandler: (() => void) | null = null;

    const revealAll = () => {
      document.querySelectorAll('[data-aos]').forEach((element) => {
        element.classList.add('aos-animate');
      });
    };

    import('aos')
      .then((module) => {
        if (disposed) return;
        const AOS = module.default;
        AOS.init({ duration: 1000, once: true });
        initialized = true;

        const refresh = () => {
          try {
            AOS.refreshHard();
          } catch {
            revealAll();
          }
        };
        refreshHandler = refresh;
        window.addEventListener('load', refresh);

        // بعد ما الصفحة تستقر: إعادة حساب العناصر + تأكيد إن أول كارت ظاهر
        setTimeout(() => {
          if (disposed) return;
          refresh();
          if (!document.querySelector('[data-aos].aos-animate')) revealAll();
        }, 450);
      })
      .catch(() => {
        if (!disposed) revealAll();
      });

    const safety = window.setTimeout(() => {
      if (!disposed && !initialized) revealAll();
    }, 2000);

    return () => {
      disposed = true;
      window.clearTimeout(safety);
      if (refreshHandler) window.removeEventListener('load', refreshHandler);
    };
  }, []);

  return null;
}
