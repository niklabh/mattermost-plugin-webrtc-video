package main

import (
	"sync"
)

// signalBroker fans out JSON payloads to SSE subscribers per topic (hub app + "/" + channel).
type signalBroker struct {
	mu   sync.RWMutex
	subs map[string][]chan []byte
}

func newSignalBroker() *signalBroker {
	return &signalBroker{
		subs: make(map[string][]chan []byte),
	}
}

func (b *signalBroker) subscribe(topic string) (<-chan []byte, func()) {
	ch := make(chan []byte, 64)
	b.mu.Lock()
	b.subs[topic] = append(b.subs[topic], ch)
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		arr := b.subs[topic]
		for i, c := range arr {
			if c == ch {
				b.subs[topic] = append(arr[:i], arr[i+1:]...)
				break
			}
		}
		b.mu.Unlock()
		close(ch)
	}
}

func (b *signalBroker) publish(topic string, payload []byte) {
	b.mu.RLock()
	slist := make([]chan []byte, len(b.subs[topic]))
	copy(slist, b.subs[topic])
	b.mu.RUnlock()
	for _, dst := range slist {
		p := make([]byte, len(payload))
		copy(p, payload)
		select {
		case dst <- p:
		default:
		}
	}
}
