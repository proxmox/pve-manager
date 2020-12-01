include ../defines.mk

all:

export PERLLIB=..

.PHONY: check
check: replication_test balloon_test mail_test vzdump_test

balloon_test:
	./balloontest.pl

replication_test:
	./replication_test1.pl
	./replication_test2.pl
	./replication_test3.pl
	./replication_test4.pl
	./replication_test5.pl
	./replication_test6.pl

mail_test:
	./mail_test.pl

vzdump_test:
	./vzdump_guest_included_test.pl
	./vzdump_new_retention_test.pl

.PHONY: install
install:

.PHONY: clean
clean:
	rm -rf *~ .mocked_* *.tmp
