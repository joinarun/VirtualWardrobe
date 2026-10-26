import { useEffect, useState } from 'react'
import './App.css'

const copyrightYear = new Date().getFullYear()

type Health = { status: string; executionMode: string; imageProvider: string }

function App() {
  const staff = window.location.pathname.startsWith('/staff')
  const [health, setHealth] = useState<Health | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/v1/health', { signal: abort.signal })
      .then(response => { if (!response.ok) throw Error('Unavailable'); return response.json() })
      .then(setHealth).catch(error => { if (error.name !== 'AbortError') setUnavailable(true) })
    return () => abort.abort()
  }, [])

  const status = <span className={`status ${health ? 'online' : ''}`}><i />{health ? 'Local services connected' : unavailable ? 'Service unavailable — check local stack' : 'Connecting to local services'}</span>
  if (staff) return <div className="workspace">
    <aside className="sidebar"><a className="wordmark light" href="/">Virtual<span>Wardrobe</span><em>STORE WORKSPACE</em></a><nav aria-label="Staff navigation"><a aria-current="page" href="/staff">Overview <span>↗</span></a><span className="deferred">Catalog <small>Coming next</small></span><span className="deferred">Enquiries <small>Coming next</small></span><span className="deferred">Team & stores <small>Coming next</small></span></nav><a className="back-link" href="/">← Customer storefront</a></aside>
    <main className="workspace-main"><header className="workspace-header"><span>YOUR WORKSPACE</span>{status}</header><section className="workspace-welcome"><p className="eyebrow">A LITTLE LESS ADMIN. A LITTLE MORE STYLE.</p><h1>Your store, thoughtfully managed.</h1><p>A calm space to curate your collection and turn customer interest into conversations.</p></section><section className="workspace-card"><div className="foundation-icon">VW</div><div><p className="eyebrow">WORK IN PROGRESS</p><h2>Workspace foundation</h2><p>The application is connected. Store accounts, product tools and customer enquiries will be added in the following features.</p><span className="tag">Development environment</span></div></section><section className="setup-grid"><article><span>01</span><h3>Curate your collection</h3><p>Bring your store's products, details and imagery together.</p></article><article><span>02</span><h3>Help customers picture it</h3><p>Make room for a personal, clearly labelled AI preview.</p></article><article><span>03</span><h3>Start a conversation</h3><p>Follow up on interest with a dedicated store enquiry.</p></article></section></main>
  </div>
  return <div className="storefront">
    <div className="announcement">A more personal way to discover Indian style.</div>
    <header className="site-header"><a className="wordmark" href="/">Virtual<span>Wardrobe</span></a><nav aria-label="Customer navigation"><a href="#how-it-works">How it works</a><a className="workspace-link" href="/staff">Store workspace <span>↗</span></a></nav></header>
    <main><section className="hero"><div className="hero-copy"><p className="eyebrow">YOUR STYLE. YOUR PERSPECTIVE.</p><h1>A new way to find your favourite drape.</h1><p className="hero-description">Discover beautiful sarees from independent stores. Soon, see an AI preview on your own photo and connect with the people behind the collection.</p><a href="#how-it-works" className="primary-button">Meet your virtual wardrobe <span>→</span></a><div className="hero-note"><span>✧</span> Thoughtfully built around your privacy.</div></div><div className="hero-art" aria-hidden="true"><div className="art-line"/><div className="art-heading">THE ART OF<br/><em>finding your drape.</em></div><div className="fabric fabric-one"/><div className="fabric fabric-two"/><div className="fabric fabric-three"/><div className="art-label">A NEW PERSPECTIVE ON PERSONAL STYLE</div><div className="art-circle">Made<br/><em>for you</em></div></div></section>
    <section id="how-it-works" className="how-section"><div className="section-heading"><p className="eyebrow">FROM DISCOVERY TO CONVERSATION</p><h2>See it. Picture it. Make it yours.</h2><p>Shopping that starts with inspiration and ends with a human connection.</p></div><div className="steps"><article><span>01 / DISCOVER</span><h3>Find a piece you love.</h3><p>Explore collections with the fabric, colour and detail that feel like you.</p></article><article><span>02 / PREVIEW</span><h3>A little imagination, made visible.</h3><p>Get an illustrative AI preview. Garment details and fit may differ.</p></article><article><span>03 / CONNECT</span><h3>Talk to the store.</h3><p>Request a callback and let a salesperson help with the next step.</p></article></div></section><section className="development-note"><div><span className="tag">Foundation preview</span><p>We’re building the first chapter. Product browsing, accounts and try-on tools are coming in the next features.</p></div>{status}</section></main><footer><a className="wordmark" href="/">Virtual<span>Wardrobe</span></a><p>Style is personal. Your photos should be, too.</p><span>© {copyrightYear} Virtual Wardrobe</span></footer>
  </div>
}
export default App
