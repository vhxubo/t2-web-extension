interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
