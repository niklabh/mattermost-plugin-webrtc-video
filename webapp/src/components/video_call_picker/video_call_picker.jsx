/* eslint-disable react/prop-types */
import React from 'react';
import PropTypes from 'prop-types';
import {Modal} from 'react-bootstrap';

import {userDisplayName} from '../../utils/dmPickerPeers';

export default class VideoCallPicker extends React.PureComponent {
    static propTypes = {
        open: PropTypes.bool.isRequired,
        peerRows: PropTypes.arrayOf(PropTypes.shape({
            peerId: PropTypes.string.isRequired,
            user: PropTypes.object.isRequired,
        })).isRequired,
        hintPeerId: PropTypes.string,
        closeVideoCallPicker: PropTypes.func.isRequired,
        makeVideoCall: PropTypes.func.isRequired,
        theme: PropTypes.object,
    };

    constructor(props) {
        super(props);
        this.state = {filter: ''};
    }

    handlePick = (peerId) => {
        this.setState({filter: ''});
        this.props.closeVideoCallPicker();
        this.props.makeVideoCall(peerId);
    };

    handleClose = () => {
        this.setState({filter: ''});
        this.props.closeVideoCallPicker();
    };

    render() {
        const {open, peerRows, hintPeerId, theme} = this.props;
        const {filter} = this.state;
        const t = theme || {};
        const bg = t.centerChannelBg || '#fff';
        const color = t.centerChannelColor || '#333';
        const linkColor = t.linkColor || '#166de0';
        const mentionBg = t.mentionBg || 'rgba(22, 109, 224, 0.08)';

        if (!open) {
            return null;
        }

        const q = filter.trim().toLowerCase();

        const sorted = [...peerRows].sort((a, b) => {
            if (hintPeerId) {
                if (a.peerId === hintPeerId) {
                    return -1;
                }
                if (b.peerId === hintPeerId) {
                    return 1;
                }
            }
            return userDisplayName(a.user).localeCompare(userDisplayName(b.user), 'en', {sensitivity: 'base'});
        });

        let filtered;
        if (q) {
            filtered = sorted.filter((r) => {
                const name = userDisplayName(r.user).toLowerCase();
                const uname = (r.user.username || '').toLowerCase();
                return name.includes(q) || uname.includes(q);
            });
        } else {
            filtered = sorted;
        }

        const s = {
            modalBody: {backgroundColor: bg, color},
            title: {fontSize: '1.25rem', fontWeight: 600, marginBottom: 8},
            hint: {fontSize: '0.875rem', opacity: 0.85, marginBottom: 12},
            input: {
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 4,
                border: `1px solid ${color}33`,
                backgroundColor: bg,
                color,
            },
            list: {listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflowY: 'auto'},
            row: {
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 4,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                backgroundColor: bg,
                color,
            },
            rowHint: {backgroundColor: mentionBg},
            sub: {fontSize: '0.8rem', opacity: 0.75},
            empty: {padding: '16px 0', textAlign: 'center', opacity: 0.8},
        };

        return (
            <Modal
                show={open}
                onHide={this.handleClose}
                dialogClassName='webrtc-video-picker-modal'
            >
                <Modal.Header closeButton={true}>
                    <Modal.Title style={s.title}>{'Start a video call'}</Modal.Title>
                </Modal.Header>
                <Modal.Body style={s.modalBody}>
                    <p style={s.hint}>
                        {'Pick someone you already have a direct message with. For others, open your DM list from the sidebar, then use their profile menu.'}
                    </p>
                    <input
                        type='search'
                        autoFocus={true}
                        placeholder='Filter by name or username…'
                        aria-label='Filter contacts'
                        value={filter}
                        onChange={(e) => this.setState({filter: e.target.value})}
                        style={s.input}
                    />
                    {filtered.length === 0 ? (
                        <div style={s.empty}>
                            {peerRows.length === 0 ? (
                                <span>{'No direct messages yet. Open a DM with someone first.'}</span>
                            ) : (
                                <span>{'No matches.'}</span>
                            )}
                        </div>
                    ) : (
                        <ul style={s.list}>
                            {filtered.map((r) => (
                                <li key={r.peerId}>
                                    <button
                                        type='button'
                                        style={{
                                            ...s.row,
                                            ...(r.peerId === hintPeerId ? s.rowHint : {}),
                                        }}
                                        onClick={() => this.handlePick(r.peerId)}
                                    >
                                        <strong>{userDisplayName(r.user)}</strong>
                                        <div style={s.sub}>
                                            {'@'}
                                            {r.user.username}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p style={{...s.sub, marginTop: 12}}>
                        <span style={{color: linkColor}}>
                            {'Tip: '}
                        </span>
                        {'open a user’s profile (avatar or name) anywhere and choose '}
                        <strong>{'Video call'}</strong>
                        {' there too.'}
                    </p>
                </Modal.Body>
            </Modal>
        );
    }
}
