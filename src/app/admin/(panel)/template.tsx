/** A template remounts on every navigation, so each admin page animates in. */
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="app-in">{children}</div>;
}
