import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MemoryGraph, type GraphData } from '../components/MemoryGraph';
import { fetchExplanation } from '../api';

interface ExplanationData {
    commandId: string;
    commandText: string;
    userQuery: string;
    graph: GraphData;
    reasoning: any;
}

export function ExplainView() {
    const { commandId } = useParams<{ commandId: string }>();
    const [data, setData] = useState<ExplanationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!commandId) return;

        const load = async () => {
            try {
                setLoading(true);
                const result = await fetchExplanation(commandId);
                setData(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load explanation');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [commandId]);

    if (loading) {
        return (
            <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="loading">Loading context...</div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="page">
                <div className="error">{error || 'Explanation not found'}</div>
                <Link to="/" style={{ display: 'block', marginTop: '20px', color: '#007AFF', textDecoration: 'none' }}>
                    ← Back to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="page">
            <div style={{ marginBottom: '40px', textAlign: 'center' }}>
                <Link to="/" style={{ color: '#007AFF', textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}>
                    ← Back to Dashboard
                </Link>
                <h1 style={{ fontSize: '32px', marginTop: '16px', marginBottom: '8px' }}>Why Ghost recalled this</h1>
                <p style={{ fontSize: '18px', color: '#666' }}>"{data.commandText}"</p>
            </div>

            <div style={{
                background: '#fff',
                borderRadius: '20px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
                padding: '24px',
                marginBottom: '40px'
            }}>
                <MemoryGraph data={data.graph} />
            </div>

            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>Reasoning Timeline</h2>
                <div className="timeline">
                    <div className="timeline-item" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ width: '2px', background: '#007AFF', position: 'relative' }}>
                            <div style={{
                                width: '12px', height: '12px', background: '#007AFF', borderRadius: '50%',
                                position: 'absolute', left: '-5px', top: '0'
                            }} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>User Query</div>
                            <div style={{ color: '#666' }}>"{data.userQuery}"</div>
                        </div>
                    </div>

                    <div className="timeline-item" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ width: '2px', background: '#34C759', position: 'relative' }}>
                            <div style={{
                                width: '12px', height: '12px', background: '#34C759', borderRadius: '50%',
                                position: 'absolute', left: '-5px', top: '0'
                            }} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Memory Retrieval</div>
                            <div style={{ color: '#666' }}>
                                Found {data.graph.nodes.filter(n => n.type === 'memory').length} relevant memories
                            </div>
                        </div>
                    </div>

                    {/* Add more timeline steps if available in data.reasoning */}
                </div>
            </div>
        </div>
    );
}
