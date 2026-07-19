export function DataTable({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <table className="ref-table">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row[0]}</td>
            <td>{row[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
