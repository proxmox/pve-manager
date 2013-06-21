include ../defines.mk

SUBDIRS = init.d cron ocf test

SCRIPTS =  			\
	vzdump			\
	vzrestore		\
	pvestatd		\
	pvesh			\
	pveam			\
	pvebanner		\
	pvectl			\
	pvedaemon		\
	pveproxy		\
	pveversion		\
	pvesubscription		\
	pvemailforward.pl	\
	pveupgrade		\
	pveperf

MANS = 				\
	pvectl.1		\
	vzdump.1		\
	vzrestore.1		\
	pvestatd.1		\
	pvedaemon.1		\
	pveproxy.1		\
	pveversion.1		\
	pvesubscription.1	\
	pveupgrade.1		\
	pveperf.1

all: ${MANS} pvemailforward

%.1: %.1.pod
	rm -f $@
	cat $<|pod2man -n $* -s 1 -r ${VERSION} -c "Proxmox Documentation" >$@

%.1.pod: %
	podselect $*>$@

pvectl.1.pod: pvectl
	perl -I.. ./pvectl printmanpod >$@

vzdump.1.pod: vzdump
	perl -I.. -T ./vzdump printmanpod >$@

pvesubscription.1.pod: pvesubscription
	perl -I.. -T ./pvesubscription printmanpod >$@

vzrestore.1.pod: vzrestore
	perl -I.. ./vzrestore printmanpod >$@

pvemailforward: pvemailforward.c
	gcc $< -o $@ -g -O2 -Wall -ldl -lc

.PHONY: install 
install: ${SCRIPTS} ${MANS} pvemailforward
	perl -I.. ./pvesh verifyapi
	install -d ${BINDIR}
	install -m 0755 ${SCRIPTS} ${BINDIR}
	install -s -m 2755 -g www-data pvemailforward ${BINDIR}
	install -d ${MAN1DIR}
	install -m 0644 ${MANS} ${MAN1DIR}
	install -d ${PODDIR}
	install -m 0644 pvectl.1.pod ${PODDIR}
	install -m 0644 vzdump.1.pod ${PODDIR}
	install -m 0644 pvesubscription.1.pod ${PODDIR}
	install -m 0644 vzrestore.1.pod ${PODDIR}
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	rm -rf *~ ${MANS} *.1.pod pvemailforward
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
