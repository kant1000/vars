export function AskAIButton({ onPress }: { onPress: () => void }) {
  return (
    <div className="ref-ai-wrap">
      <button className="ref-ai-btn" onClick={onPress}>
        Ask your AI
      </button>
    </div>
  );
}
