package main

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recvWithin reads one message from ch or fails the test after d.
func recvWithin(t *testing.T, ch <-chan []byte, d time.Duration) ([]byte, bool) {
	t.Helper()
	select {
	case msg, ok := <-ch:
		return msg, ok
	case <-time.After(d):
		t.Fatalf("timed out after %s waiting for signal message", d)
		return nil, false
	}
}

func TestSignalBrokerSubscribePublishDelivers(t *testing.T) {
	b := newSignalBroker()
	ch, unsub := b.subscribe("room-1")
	defer unsub()

	b.publish("room-1", []byte(`{"hello":"world"}`))

	msg, ok := recvWithin(t, ch, time.Second)
	require.True(t, ok, "channel should still be open")
	assert.Equal(t, `{"hello":"world"}`, string(msg))
}

func TestSignalBrokerPublishCopiesPayload(t *testing.T) {
	// The broker must not hand out the caller's slice; mutating the original
	// payload after publish() must not change what subscribers observe.
	b := newSignalBroker()
	ch, unsub := b.subscribe("room")
	defer unsub()

	payload := []byte(`{"v":1}`)
	b.publish("room", payload)
	for i := range payload {
		payload[i] = 'X'
	}

	msg, ok := recvWithin(t, ch, time.Second)
	require.True(t, ok)
	assert.Equal(t, `{"v":1}`, string(msg))
}

func TestSignalBrokerFansOutToMultipleSubscribers(t *testing.T) {
	b := newSignalBroker()
	ch1, unsub1 := b.subscribe("room")
	defer unsub1()
	ch2, unsub2 := b.subscribe("room")
	defer unsub2()

	b.publish("room", []byte(`{"k":"v"}`))

	for i, ch := range []<-chan []byte{ch1, ch2} {
		msg, ok := recvWithin(t, ch, time.Second)
		require.True(t, ok, "subscriber %d closed unexpectedly", i)
		assert.Equal(t, `{"k":"v"}`, string(msg), "subscriber %d", i)
	}
}

func TestSignalBrokerTopicIsolation(t *testing.T) {
	b := newSignalBroker()
	chA, unsubA := b.subscribe("room-A")
	defer unsubA()
	chB, unsubB := b.subscribe("room-B")
	defer unsubB()

	b.publish("room-A", []byte(`"only-A"`))

	msg, ok := recvWithin(t, chA, time.Second)
	require.True(t, ok)
	assert.Equal(t, `"only-A"`, string(msg))

	select {
	case unexpected := <-chB:
		t.Fatalf("subscriber on room-B received cross-topic message: %s", unexpected)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSignalBrokerPublishToUnknownTopicIsNoop(t *testing.T) {
	b := newSignalBroker()
	// Should not panic and should not block.
	b.publish("nobody-home", []byte(`{}`))
}

func TestSignalBrokerUnsubscribeStopsDelivery(t *testing.T) {
	b := newSignalBroker()
	ch, unsub := b.subscribe("room")

	unsub()

	// After unsubscribe, the channel must be closed.
	_, ok := <-ch
	assert.False(t, ok, "channel should be closed after unsubscribe")

	// Publishing afterwards must not panic and must not deliver anywhere.
	b.publish("room", []byte(`{}`))
}

func TestSignalBrokerUnsubscribeOnlyRemovesSelf(t *testing.T) {
	b := newSignalBroker()
	ch1, unsub1 := b.subscribe("room")
	ch2, unsub2 := b.subscribe("room")
	defer unsub2()

	unsub1()

	b.publish("room", []byte(`"hi"`))

	// ch1 is closed and must not receive a value.
	_, ok := <-ch1
	assert.False(t, ok, "unsubscribed channel must be closed")

	msg, ok := recvWithin(t, ch2, time.Second)
	require.True(t, ok)
	assert.Equal(t, `"hi"`, string(msg))
}

func TestSignalBrokerDropsWhenSubscriberBufferFull(t *testing.T) {
	// Internal buffer is 64; the 65th publish must not block the broker
	// nor be delivered to the slow subscriber.
	b := newSignalBroker()
	ch, unsub := b.subscribe("room")
	defer unsub()

	const bufSize = 64
	for i := 0; i < bufSize; i++ {
		b.publish("room", []byte(`"x"`))
	}

	done := make(chan struct{})
	go func() {
		b.publish("room", []byte(`"overflow"`))
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("publish blocked when subscriber buffer was full")
	}

	for i := 0; i < bufSize; i++ {
		msg, ok := recvWithin(t, ch, time.Second)
		require.True(t, ok)
		assert.Equal(t, `"x"`, string(msg))
	}
	select {
	case extra := <-ch:
		t.Fatalf("expected overflow message to be dropped, but received %s", extra)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSignalBrokerConcurrentSubscribePublishUnsubscribe(t *testing.T) {
	// Exercises the RWMutex paths; the test is primarily for `go test -race`.
	b := newSignalBroker()

	const (
		topics      = 8
		subsPerTop  = 16
		publishers  = 8
		perTopicMsg = 50
	)

	var wg sync.WaitGroup
	stopRead := make(chan struct{})

	for ti := 0; ti < topics; ti++ {
		topic := string(rune('A' + ti))
		for si := 0; si < subsPerTop; si++ {
			ch, unsub := b.subscribe(topic)
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer unsub()
				for {
					select {
					case <-stopRead:
						return
					case _, ok := <-ch:
						if !ok {
							return
						}
					}
				}
			}()
		}
	}

	var pubWG sync.WaitGroup
	for p := 0; p < publishers; p++ {
		pubWG.Add(1)
		go func() {
			defer pubWG.Done()
			for ti := 0; ti < topics; ti++ {
				topic := string(rune('A' + ti))
				for i := 0; i < perTopicMsg; i++ {
					b.publish(topic, []byte(`{"x":1}`))
				}
			}
		}()
	}

	pubWG.Wait()
	close(stopRead)
	wg.Wait()
}
