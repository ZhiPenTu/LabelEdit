import Markdown from "react-markdown";

export default function ReleaseNotes({ body }: { body: string }) {
  return (
    <Markdown
      skipHtml
      disallowedElements={["img"]}
      components={{
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      }}
    >
      {body}
    </Markdown>
  );
}
