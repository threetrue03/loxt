import { Component } from 'react';
export default class WorkspaceBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <section className="content"><h1>화면을 표시하지 못했습니다</h1><p className="hint">저장된 기록과 원본은 보존됩니다. 화면을 다시 열어 주세요.</p><button className="secondary" onClick={() => this.setState({ error: null })}>화면 다시 열기</button></section>;
    return this.props.children;
  }
}
