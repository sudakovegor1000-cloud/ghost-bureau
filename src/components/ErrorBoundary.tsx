import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Последний рубеж: если что-то упало при отрисовке — понятный экран вместо белого листа */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ghost-bureau]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bsod" role="alert">
        <div className="bsod-inner">
          <p className="bsod-title">&nbsp;GHOSTS&nbsp;</p>
          <p>
            Произошла неустранимая ошибка призрака 0E в 0028:C0011E36. Бюро не смогло отрисовать экран.
          </p>
          <p className="bsod-msg">* {this.state.error.message}</p>
          <p>* Нажмите «Попробовать снова», чтобы перерисовать экран.</p>
          <p>* Нажмите «Перезапустить», чтобы открыть бюро заново с демо-данными. Несохранённые изменения будут потеряны.</p>
          <div className="row-actions">
            <button className="bsod-btn" onClick={() => this.setState({ error: null })}>
              Попробовать снова
            </button>
            <button
              className="bsod-btn"
              onClick={() => location.reload()}
            >
              Перезапустить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
