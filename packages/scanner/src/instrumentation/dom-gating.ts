import type { Page } from "playwright";

/**
 * DOM GATING & ASYMMETRIC BUTTON INSTRUMENTATION — Module 22 (Phase 15).
 *
 * Detects cookie walls / forcible gating (PDM-R029) and deceptive asymmetric
 * button sizing / dark patterns (PDM-R041).
 */

export interface DomGatingFact {
  hasScrollLock: boolean;
  backdropCoveragePct: number;
  hasCloseOrDismiss: boolean;
  isCookieWall: boolean;
}

export interface ButtonGeometryFact {
  acceptArea: number;
  rejectArea: number;
  areaRatio: number;
  isAsymmetric: boolean;
}

/**
 * Evaluates DOM scroll lock and modal backdrop coverage on the active page.
 */
export async function measureDomGating(page: Page): Promise<DomGatingFact> {
  try {
    const result = (await page.evaluate(`
      (() => {
        const bodyStyle = window.getComputedStyle(document.body);
        const htmlStyle = window.getComputedStyle(document.documentElement);

        const hasScrollLock =
          bodyStyle.overflow === 'hidden' ||
          bodyStyle.position === 'fixed' ||
          htmlStyle.overflow === 'hidden';

        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        const viewportArea = vw * vh;

        let maxBackdropCoverage = 0;
        let hasClose = false;

        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          const pos = style.position;
          const z = parseInt(style.zIndex, 10) || 0;

          if ((pos === 'fixed' || pos === 'absolute') && z >= 50) {
            const rect = el.getBoundingClientRect();
            const area = Math.max(0, rect.width) * Math.max(0, rect.height);
            const coverage = Math.min(100, Math.round((area / viewportArea) * 100));

            if (coverage > maxBackdropCoverage) {
              maxBackdropCoverage = coverage;
            }

            // Check if there is a close, dismiss, or cancel button inside or near
            const text = (el.textContent || '').toLowerCase();
            const closeBtn = el.querySelector(
              '[aria-label*="close" i], [aria-label*="dismiss" i], .close, .dismiss'
            );
            if (
              closeBtn ||
              text.includes('dismiss') ||
              text.includes('continue without') ||
              text.includes('close') ||
              text.includes('✕') ||
              text.includes('×')
            ) {
              hasClose = true;
            }
          }
        }

        const isWall = hasScrollLock && maxBackdropCoverage >= 85 && !hasClose;

        return {
          hasScrollLock,
          backdropCoveragePct: maxBackdropCoverage,
          hasCloseOrDismiss: hasClose,
          isCookieWall: isWall
        };
      })()
    `)) as DomGatingFact;

    return result;
  } catch {
    return {
      hasScrollLock: false,
      backdropCoveragePct: 0,
      hasCloseOrDismiss: true,
      isCookieWall: false,
    };
  }
}

/**
 * Measures the bounding boxes of Accept All vs Reject All consent buttons.
 */
export async function measureConsentButtonAsymmetry(
  page: Page,
): Promise<ButtonGeometryFact | null> {
  try {
    const result = (await page.evaluate(`
      (() => {
        const acceptSelectors = [
          '[data-cmp-accept]',
          '#accept',
          '.accept-all',
          'button[id*="accept" i]',
          'button[class*="accept" i]',
          'button[data-testid*="accept" i]'
        ];

        const rejectSelectors = [
          '[data-cmp-reject]',
          '#reject',
          '.reject-all',
          'button[id*="reject" i]',
          'button[class*="reject" i]',
          'button[data-testid*="reject" i]',
          'button[id*="deny" i]'
        ];

        let acceptBtn = null;
        for (const sel of acceptSelectors) {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().width > 0) {
            acceptBtn = el;
            break;
          }
        }

        let rejectBtn = null;
        for (const sel of rejectSelectors) {
          const el = document.querySelector(sel);
          if (el && el.getBoundingClientRect().width > 0) {
            rejectBtn = el;
            break;
          }
        }

        // Fallback text check
        if (!acceptBtn || !rejectBtn) {
          const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
          for (const b of buttons) {
            const txt = (b.textContent || '').trim().toLowerCase();
            if (!acceptBtn && (txt === 'accept all' || txt === 'allow all' || txt === 'accept')) {
              acceptBtn = b;
            }
            if (!rejectBtn && (txt === 'reject all' || txt === 'deny all' || txt === 'reject' || txt === 'deny')) {
              rejectBtn = b;
            }
          }
        }

        if (!acceptBtn || !rejectBtn) return null;

        const rectAccept = acceptBtn.getBoundingClientRect();
        const rectReject = rejectBtn.getBoundingClientRect();
        const areaAccept = rectAccept.width * rectAccept.height;
        const areaReject = rectReject.width * rectReject.height;

        const areaRatio = areaReject > 0 ? Number((areaAccept / areaReject).toFixed(2)) : 1;
        const isAsymmetric = areaRatio > 2.0;

        return {
          acceptArea: Math.round(areaAccept),
          rejectArea: Math.round(areaReject),
          areaRatio,
          isAsymmetric
        };
      })()
    `)) as ButtonGeometryFact | null;

    return result;
  } catch {
    return null;
  }
}
