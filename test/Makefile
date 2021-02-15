include ../defines.mk

all:

export PERLLIB=..

.PHONY: check balloon-test replication-test mail-test vzdump-test
check: test-replication test-balloon test-mail test-vzdump

test-balloon:
	./balloontest.pl

test-replication: replication1.t replication2.t replication3.t replication4.t replication5.t replication6.t

replication%.t: replication_test%.pl
	./$<

test-mail:
	./mail_test.pl

test-vzdump: test-vzdump-guest-included test-vzdump-new

.PHONY: test-vzdump-guest-included test-vzdump-new
test-vzdump-guest-included:
	./vzdump_guest_included_test.pl

test-vzdump-new:
	./vzdump_new_test.pl

.PHONY: install
install:

.PHONY: clean
clean:
	rm -rf *~ .mocked_* *.tmp
