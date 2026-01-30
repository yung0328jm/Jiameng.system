import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    try {
      // 留一份到 console，方便抓到真因
      console.error('UI crashed:', error, info)
    } catch (_) {}
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const err = this.state.error
    const info = this.state.info
    const msg = String(err?.message || err || 'Unknown error')
    const stack = String(err?.stack || '')
    const comp = String(info?.componentStack || '')
    return (
      <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
        <h2 className="text-2xl font-bold text-red-300 mb-3">頁面發生錯誤</h2>
        <p className="text-gray-300 text-sm mb-4">請把以下錯誤訊息貼給我，我就能立刻修正。</p>
        <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-200 overflow-auto whitespace-pre-wrap">
{`message: ${msg}

stack:
${stack}

componentStack:
${comp}`}
        </pre>
      </div>
    )
  }
}

