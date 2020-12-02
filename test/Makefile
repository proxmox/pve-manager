include ../defines.mk

all:

export PERLLIB=..

.PHONY: check balloon-test replication-test mail-test vzdump-test
check: test-replication test-balloon test-mail test-vzdump

test-balloon:
	./balloontest.pl

test-replication:
	./replication_test1.pl
	./replication_test2.pl
	./replication_test3.pl
	./replication_test4.pl
	./replication_test5.pl
	./replication_test6.pl

test-mail:
	./mail_test.pl

test-vzdump: test-vzdump-guest-included test-vzdump-retention

.PHONY: test-vzdump-guest-included test-vzdump-retention
test-vzdump-guest-included:
	./vzdump_guest_included_test.pl

test-vzdump-retention:
	./vzdump_new_retention_test.pl

.PHONY: install
install:

.PHONY: clean
clean:
	rm -rf *~ .mocked_* *.tmp
