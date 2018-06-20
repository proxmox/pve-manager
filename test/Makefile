include ../defines.mk

all:

export PERLLIB=..

check:
	./balloontest.pl
	./replication_test1.pl
	./replication_test2.pl
	./replication_test3.pl
	./replication_test4.pl
	./replication_test5.pl
	./replication_test6.pl

.PHONY: install
install:

.PHONY: clean
clean:
	rm -rf *~ .mocked_* *.tmp
