import GameCanvas from "../components/GameCanvas";

export default function Page() {
  return (
    <main className="container">
      <header className="header">
        <h1>Castle Attack</h1>
        <p>Build your castle, then survive the attack.</p>
      </header>
      <section className="game-wrapper">
        <GameCanvas />
      </section>
      <footer className="footer">
        <span>Tip: Place walls in build mode. Start the attack when ready.</span>
      </footer>
    </main>
  );
}
