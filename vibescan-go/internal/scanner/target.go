// Package scanner implements the VibeScan agent: random target generation, nmap
// discovery, browser capture, and signed submission to the collector.
package scanner

import (
	"math/rand/v2"
	"net/netip"
	"sync"
)

// Blacklist holds CIDR exclusions and generates random public IPv4 targets that
// avoid them, mirroring common/nettools.py:random_ip.
type Blacklist struct {
	mu   sync.RWMutex
	nets []netip.Prefix
}

// NewBlacklist parses CIDR strings (invalid entries are skipped).
func NewBlacklist(cidrs []string) *Blacklist {
	b := &Blacklist{}
	b.Set(cidrs)
	return b
}

// Set replaces the CIDR set (used on periodic refresh from the collector).
func (b *Blacklist) Set(cidrs []string) {
	nets := make([]netip.Prefix, 0, len(cidrs))
	for _, c := range cidrs {
		if p, err := netip.ParsePrefix(c); err == nil {
			nets = append(nets, p.Masked())
		}
	}
	b.mu.Lock()
	b.nets = nets
	b.mu.Unlock()
}

// Contains reports whether addr falls in any excluded CIDR.
func (b *Blacklist) Contains(addr netip.Addr) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, p := range b.nets {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// addrFromUint32 maps every possible 32-bit value to exactly one IPv4 address.
// Keeping this conversion explicit makes it easy to verify that .255 octets and
// the top of the address space are not accidentally omitted.
func addrFromUint32(v uint32) netip.Addr {
	return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)})
}

// RandomIP returns a uniformly sampled IPv4 address not in the blacklist.
// Production agents seed the blacklist with private, reserved, documentation,
// multicast, and other special-use ranges before generating their first batch.
func (b *Blacklist) RandomIP() string {
	for {
		addr := addrFromUint32(rand.Uint32())
		first := addr.As4()[0]
		// These two /8s are never public targets. Keep the guard independent
		// of the remotely managed exclusion list, matching the prior safety
		// invariant while sampling every remaining 32-bit address uniformly.
		if first == 0 || first == 127 {
			continue
		}
		if !b.Contains(addr) {
			return addr.String()
		}
	}
}

// RandomBatch returns n distinct random target IPs.
func (b *Blacklist) RandomBatch(n int) []string {
	seen := make(map[string]struct{}, n)
	out := make([]string, 0, n)
	for len(out) < n {
		ip := b.RandomIP()
		if _, dup := seen[ip]; dup {
			continue
		}
		seen[ip] = struct{}{}
		out = append(out, ip)
	}
	return out
}
