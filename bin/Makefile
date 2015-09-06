include ../defines.mk

SUBDIRS = init.d ocf test

SERVICES = pvestatd pveproxy
CLITOOLS = vzdump pvesubscription

SCRIPTS =  			\
	${SERVICES}		\
	${CLITOOLS}		\
	pveceph			\
	pvesh			\
	pveam			\
	pvebanner		\
	pvedaemon		\
	spiceproxy		\
	pveversion		\
	pvemailforward.pl	\
	pveupgrade		\
	pveupdate		\
	pveperf

SERVICE_MANS = $(addsuffix .8, ${SERVICES})

CLI_MANS = 				\
	$(addsuffix .1, ${CLITOOLS})	\
	pveceph.1			\
	pvedaemon.1			\
	spiceproxy.1			\
	pveversion.1			\
	pveupgrade.1			\
	pveperf.1

all: ${SERVICE_MANS} ${CLI_MANS} pvemailforward

%.1.pod: %
	perl -I.. -T -e "use PVE::CLI::$*; PVE::CLI::$*->generate_pod_manpage();" >$@.tmp
	mv $@.tmp $@

%.8.pod: %
	perl -I.. -T -e "use PVE::Service::$*; PVE::Service::$*->generate_pod_manpage();" >$@.tmp
	mv $@.tmp $@

%.1: %.1.pod
	rm -f $@
	cat $<|pod2man -n $* -s 1 -r ${VERSION} -c "Proxmox Documentation" >$@.tmp
	mv $@.tmp $@

%.8: %.8.pod
	rm -f $@
	cat $<|pod2man -n $* -s 8 -r ${VERSION} -c "Proxmox Documentation" >$@.tmp
	mv $@.tmp $@

pveversion.1.pod: pveversion
	podselect $< > $@.tmp
	mv $@.tmp $@

pveupgrade.1.pod: pveupgrade
	podselect $< > $@.tmp
	mv $@.tmp $@

pveperf.1.pod: pveperf
	podselect $< > $@.tmp
	mv $@.tmp $@

%.service-bash-completion:
	perl -I.. -T -e "use PVE::Service::$*; PVE::Service::$*->generate_bash_completions();" >$@.tmp
	mv $@.tmp $@

%.bash-completion:
	perl -I.. -T -e "use PVE::CLI::$*; PVE::CLI::$*->generate_bash_completions();" >$@.tmp
	mv $@.tmp $@

pvedaemon.1.pod: pvedaemon
	perl -I.. -T ./pvedaemon printmanpod >$@

spiceproxy.1.pod: spiceproxy
	perl -I.. -T ./spiceproxy printmanpod >$@

pvectl.1.pod: pvectl
	perl -I.. ./pvectl printmanpod >$@

pveceph.1.pod: pveceph
	perl -I.. -T ./pveceph printmanpod >$@

vzrestore.1.pod: vzrestore
	perl -I.. ./vzrestore printmanpod >$@

pvemailforward: pvemailforward.c
	gcc $< -o $@ -g -O2 -Wall -ldl -lc

.PHONY: install
install: ${SCRIPTS} ${CLI_MANS} ${SERVICE_MANS} pvemailforward $(addsuffix .service-bash-completion, ${SERVICES}) $(addsuffix .bash-completion, ${CLITOOLS})
	perl -I.. ./pvesh verifyapi
	for i in ${CLITOOLS}; do perl -I.. -T -e "use PVE::CLI::$$i; PVE::CLI::$$i->verify_api();"; done
	for i in ${SERVICES}; do perl -I.. -T -e "use PVE::Service::$$i; PVE::Service::$$i->verify_api();"; done
	install -d ${BINDIR}
	install -m 0755 ${SCRIPTS} ${BINDIR}
	install -s -m 2755 -g www-data pvemailforward ${BINDIR}
	install -d ${MAN1DIR}
	install -m 0644 ${CLI_MANS} ${MAN1DIR}
	install -d ${MAN8DIR}
	install -m 0644 ${SERVICE_MANS} ${MAN8DIR}
	install -d ${PODDIR}
	for i in ${CLITOOLS}; do install -m 0644 $$i.1.pod ${PODDIR}; done
	for i in ${CLITOOLS}; do install -m 0644 -D $$i.bash-completion ${BASHCOMPLDIR}/$$i; done
	for i in ${SERVICES}; do install -m 0644 -D $$i.service-bash-completion ${BASHCOMPLDIR}/$$i; done
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	rm -rf *~ *.tmp ${CLI_MANS} ${SERVICE_MANS} *.1.pod *.8.pod pvemailforward *.bash-completion *.service-bash-completion
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
