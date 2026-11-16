import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

/** Syntax-highlighted editor (lazy-loaded where it's used, so the main bundle stays small). */
export const langFor = (name: string) =>
  /\.css$/i.test(name) ? [css()] : /\.json$/i.test(name) ? [json()] : /\.(m?js|jsx|tsx?)$/i.test(name) ? [javascript({ jsx: true, typescript: /\.tsx?$/i.test(name) })] : [html()];

export default function CodeEditor({ name, value, onChange, height = "100%" }: { name: string; value: string; onChange: (v: string) => void; height?: string }) {
  return (
    <CodeMirror
      value={value}
      height={height}
      className="h-full text-[13px]"
      theme={oneDark}
      extensions={langFor(name)}
      onChange={onChange}
      basicSetup={{ foldGutter: true, highlightActiveLine: true, searchKeymap: true }}
      aria-label={`Edit ${name}`}
    />
  );
}
