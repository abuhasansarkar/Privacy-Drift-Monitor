import { describe, expect, it } from "vitest";
import {
  extractPolicyLinksFromHtml,
  selectBestPolicyLink,
  resolveSafePolicyUrl,
} from "../policy/discovery";
import { decodeHtmlEntities, extractCleanText } from "../policy/extractor";

describe("Policy Link Discovery", () => {
  const sampleHtml = `
    <html>
      <head><title>Test Store</title></head>
      <body>
        <header>
          <nav>
            <a href="/shop">Shop</a>
            <a href="/about">About Us</a>
          </nav>
        </header>
        <main>
          <h1>Welcome</h1>
          <p>Some content</p>
        </main>
        <footer>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/cookie-policy">Cookie Settings</a>
          <a href="mailto:support@example.com">Contact</a>
        </footer>
      </body>
    </html>
  `;

  it("extracts privacy and cookie policy links from HTML", () => {
    const links = extractPolicyLinksFromHtml(sampleHtml, "https://example.com");
    expect(links.length).toBeGreaterThanOrEqual(2);

    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain("https://example.com/privacy-policy");
    expect(hrefs).toContain("https://example.com/cookie-policy");
  });

  it("selects the best policy link prioritizing Privacy Policy text and href", () => {
    const links = extractPolicyLinksFromHtml(sampleHtml, "https://example.com");
    const best = selectBestPolicyLink(links, "https://example.com");
    expect(best).toBe("https://example.com/privacy-policy");
  });

  it("safely resolves valid URLs and rejects SSRF attempts", async () => {
    // Mock resolver for safe test
    const mockSafeResolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const safe = await resolveSafePolicyUrl("https://example.com/privacy", {
      resolver: mockSafeResolver,
    });
    expect(safe).toBe("https://example.com/privacy");

    // SSRF attempt to cloud metadata
    const blocked = await resolveSafePolicyUrl("http://169.254.169.254/latest/meta-data");
    expect(blocked).toBeNull();
  });
});

describe("Clean Text Extractor", () => {
  it("decodes HTML entities properly", () => {
    const raw = "Privacy &amp; Terms &bull; &copy; 2026 &quot;Company&quot;";
    expect(decodeHtmlEntities(raw)).toContain("Privacy & Terms");
    expect(decodeHtmlEntities(raw)).toContain('"Company"');
  });

  it("strips navigation, header, footer, scripts and formats headings", () => {
    const html = `
      <header><nav><a href="/">Home</a></nav></header>
      <script>console.log("tracking code");</script>
      <style>.body { color: red; }</style>
      <article>
        <h1>Privacy Notice</h1>
        <p>Effective Date: January 15, 2026</p>
        <h2>Third-Party Vendors</h2>
        <p>We work with Meta Pixel and Google Analytics to monitor website usage.</p>
        <ul>
          <li>Meta Pixel for remarketing</li>
          <li>Google Analytics for metrics</li>
        </ul>
      </article>
      <footer><p>Copyright 2026</p></footer>
    `;

    const text = extractCleanText(html);
    expect(text).not.toContain("console.log");
    expect(text).not.toContain(".body { color: red; }");
    expect(text).not.toContain("Copyright 2026");
    expect(text).toContain("### Privacy Notice");
    expect(text).toContain("Meta Pixel");
    expect(text).toContain("Google Analytics");
    expect(text).toContain("• Meta Pixel for remarketing");
  });

  it("truncates content exceeding maxCharacters safely at word boundary", () => {
    const longHtml = "<p>" + "Very long privacy document text here ".repeat(100) + "</p>";
    const truncated = extractCleanText(longHtml, { maxCharacters: 150 });
    expect(truncated.length).toBeLessThanOrEqual(200);
    expect(truncated).toContain("[Content truncated for analysis]");
  });
});
