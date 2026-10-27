import { UiIcon } from "../components/UiIcon";

export function PrivacyPage() {
  return <main className="privacy-page account-page"><article className="form-card wide-card">
    <a className="text-button" href="/"><UiIcon kind="left" />Back to collection</a>
    <p className="eyebrow">A SPACE THAT STAYS YOURS</p>
    <h1>Your photos, your choice.</h1>
    <p className="form-intro">A few simple things to know about your wardrobe.</p>
    <section><h2>When you add a photo</h2><p>Choosing a photo shows it on your device first. Creating a preview sends it for processing. Your photo and previews are private to your customer account; store teams cannot see them.</p></section>
    <section><h2>Keep what you love</h2><p>Source photos and unsaved previews expire within 24 hours. Saved previews stay in your gallery until you remove them. You can also download a copy to your own device.</p></section>
    <section><h2>You're in control</h2><p>You can cancel a waiting request, remove previews, or delete your account from your account settings. Removing a preview ends new access and starts its deletion. Copies you downloaded stay on your device.</p></section>
    <section><h2>Connecting with a store</h2><p>Requesting a callback is separate. That form asks before sharing your name, mobile number and message with the selected store. Your photos are never included.</p></section>
    <a className="primary-button" href="/account">Manage my account<UiIcon kind="right" /></a>
  </article></main>;
}
