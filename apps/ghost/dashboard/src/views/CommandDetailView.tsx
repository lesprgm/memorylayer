import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCommandById } from '../api';
import type { Command } from '../types';
import { MemoryGraph, type GraphData } from '../components/MemoryGraph';

export function CommandDetailView() {
    const { commandId } = useParams<{ commandId: string }>();
    const navigate = useNavigate();
    const [command, setCommand] = useState<Command | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!commandId) return;

        const load = async () => {
            try {
                setLoading(true);
                const data = await fetchCommandById(commandId);
                setCommand(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load command');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [commandId]);

    // Transform command data into graph data
    const graphData = useMemo<GraphData | null>(() => {
        if (!command) return null;

        const nodes: any[] = [];
        const edges: any[] = [];

        // Central node: The Command
        nodes.push({
            id: 'root',
            type: 'query',
            label: 'Command',
            confidence: 1
        });

        // Memory nodes
        if (command.memories_used) {
            command.memories_used.forEach((memory) => {
                // Filter out MAKER verified nodes from graph
                if (memory.metadata?.maker_verified) return;

                const isFile = !!memory.metadata?.path;
                const label = isFile
                    ? memory.metadata!.path.split('/').pop()
                    : (memory.summary || memory.id).slice(0, 20) + '...';

                nodes.push({
                    id: memory.id,
                    type: isFile ? 'file' : (memory.type || 'memory'), // Pass actual type (e.g. 'fact.session')
                    label: isFile ? memory.metadata!.path : label, // Full path for label to support opening
                    confidence: memory.score,
                    source_path: memory.metadata?.path // Add source path for tooltip
                });

                edges.push({
                    source: 'root',
                    target: memory.id,
                    weight: memory.score
                });
            });
        }

        return { nodes, edges };
    }, [command]);

    if (loading) {
        return (
            <div className="page" style={{
                background: '#FFFFFF',
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1D1D1F'
            }}>
                <div className="loading" style={{ color: '#86868B' }}>Loading...</div>
            </div>
        );
    }

    if (error || !command) {
        return (
            <div className="page" style={{
                background: '#FFFFFF',
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1D1D1F'
            }}>
                <div className="error" style={{ color: '#FF3B30', marginBottom: '20px' }}>{error || 'Command not found'}</div>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        background: '#0071E3',
                        color: '#FFF',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '20px',
                        fontSize: '15px',
                        cursor: 'pointer'
                    }}
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="page" style={{
            background: '#FFFFFF',
            minHeight: '100vh',
            padding: '60px 20px',
            color: '#1D1D1F',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Navigation */}
                <button
                    onClick={() => navigate('/')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#86868B',
                        fontSize: '15px',
                        cursor: 'pointer',
                        marginBottom: '40px',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        fontWeight: 500,
                        transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#1D1D1F'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#86868B'}
                >
                    <span style={{ marginRight: '6px' }}>←</span> Dashboard
                </button>

                {/* Hero Section */}
                <div style={{ marginBottom: '60px' }}>
                    <h1 style={{
                        fontSize: '40px',
                        fontWeight: 700,
                        lineHeight: '1.1',
                        marginBottom: '12px',
                        letterSpacing: '-0.02em',
                        color: '#1D1D1F'
                    }}>
                        {command.text}
                    </h1>
                    <div style={{
                        color: '#86868B',
                        fontSize: '15px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <span>
                            {new Date(command.timestamp || command.created_at).toLocaleString(undefined, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric'
                            })}
                        </span>
                        <button
                            onClick={() => navigate(`/explain/${command.id}`)}
                            style={{
                                background: 'rgba(0, 113, 227, 0.1)',
                                color: '#0071E3',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '12px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 113, 227, 0.2)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 113, 227, 0.1)'}
                        >
                            Explain Reasoning
                        </button>
                    </div>
                </div>

                {/* Knowledge Graph */}
                {
                    graphData && graphData.nodes.length > 1 && (
                        <div style={{ marginBottom: '60px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h2 style={{
                                    fontSize: '12px',
                                    textTransform: 'uppercase',
                                    color: '#86868B',
                                    letterSpacing: '0.05em',
                                    fontWeight: 600,
                                    margin: 0
                                }}>
                                    Knowledge Graph
                                </h2>
                                <span style={{
                                    color: '#86868B',
                                    fontSize: '13px',
                                    fontWeight: 500
                                }}>
                                    {graphData.nodes.length - 1} Nodes
                                </span>
                            </div>

                            <div style={{
                                background: '#F5F5F7',
                                borderRadius: '20px',
                                overflow: 'hidden',
                                height: '500px',
                            }}>
                                <MemoryGraph data={graphData} />
                            </div>
                        </div>
                    )
                }

                {/* Assistant Response */}
                <div style={{ marginBottom: '60px', fontSize: '17px', lineHeight: '1.6' }}>
                    {command.assistant_text}
                </div>

                {/* Actions & Metadata */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '40px' }}>

                    {/* Actions */}
                    {command.actions && command.actions.length > 0 && (
                        <div>
                            <h2 style={{
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                color: '#86868B',
                                marginBottom: '16px',
                                letterSpacing: '0.05em',
                                fontWeight: 600
                            }}>
                                Actions
                            </h2>
                            <div className="actions-list">
                                {command.actions.map((actionResult: any, index: number) => (
                                    <div key={index} style={{
                                        background: '#F5F5F7',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        marginBottom: '12px',
                                        fontSize: '13px',
                                        fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                                        color: '#1D1D1F'
                                    }}>
                                        <div style={{ color: '#0071E3', fontWeight: 600, marginBottom: '4px' }}>
                                            {actionResult.action?.type || actionResult.type}
                                        </div>
                                        <div style={{ color: '#86868B', wordBreak: 'break-all' }}>
                                            {JSON.stringify(actionResult.action?.params || actionResult.params)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <h2 style={{
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            color: '#86868B',
                            marginBottom: '16px',
                            letterSpacing: '0.05em',
                            fontWeight: 600
                        }}>
                            Metadata
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'max-content 1fr',
                            gap: '8px 24px',
                            fontSize: '13px',
                            color: '#1D1D1F'
                        }}>
                            <div style={{ color: '#86868B' }}>ID</div>
                            <div style={{ fontFamily: 'SF Mono, Monaco, monospace' }}>{command.id}</div>

                            <div style={{ color: '#86868B' }}>Created</div>
                            <div>{new Date(command.timestamp || command.created_at).toISOString()}</div>

                            <div style={{ color: '#86868B' }}>Sources</div>
                            <div>{command.memories_used?.length || 0}</div>

                            <div style={{ color: '#86868B' }}>Actions</div>
                            <div>{command.actions?.length || 0}</div>
                        </div>
                    </div>
                </div>
            </div >
        </div >
    );
}
