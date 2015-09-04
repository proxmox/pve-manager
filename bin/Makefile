include ../defines.mk

SUBDIRS = init.d cron ocf test

SCRIPTS =  			\
	pveceph			\
	vzdump			\
	pvestatd		\
	pvesh			\
	pveam			\
	pvebanner		\
	pvedaemon		\
	pveproxy		\
	spiceproxy		\
	pveversion		\
	pvesubscription		\
	pvemailforward.pl	\
	pveupgrade		\
	pveperf

MANS = 				\
	pveceph.1		\
	vzdump.1		\
	pvestatd.1		\
	pvedaemon.1		\
	pveproxy.1		\
	spiceproxy.1		\
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

pvestatd.1.pod:
	perl -I.. -T -e "use PVE::Service::pvestatd; PVE::Service::pvestatd->generate_pod_manpage();" >$@

pvestatd.bash-completion:
	perl -I.. -T -e "use PVE::Service::pvestatd; PVE::Service::pvestatd->generate_bash_completions();" >$@

pvedaemon.1.pod: pvedaemon
	perl -I.. -T ./pvedaemon printmanpod >$@

pveproxy.1.pod: pveproxy
	perl -I.. -T ./pveproxy printmanpod >$@

spiceproxy.1.pod: spiceproxy
	perl -I.. -T ./spiceproxy printmanpod >$@

pvectl.1.pod: pvectl
	perl -I.. ./pvectl printmanpod >$@

pveceph.1.pod: pveceph
	perl -I.. -T ./pveceph printmanpod >$@

vzdump.1.pod: vzdump
	perl -I.. -T -e "use PVE::CLI::vzdump; PVE::CLI::vzdump->generate_pod_manpage();" >$@

vzdump.bash-completion:
	perl -I.. -T -e "use PVE::CLI::vzdump; PVE::CLI::vzdump->generate_bash_completions();" >$@

pvesubscription.1.pod: pvesubscription
	perl -I.. -T ./pvesubscription printmanpod >$@

vzrestore.1.pod: vzrestore
	perl -I.. ./vzrestore printmanpod >$@

pvemailforward: pvemailforward.c
	gcc $< -o $@ -g -O2 -Wall -ldl -lc

.PHONY: install 
install: ${SCRIPTS} ${MANS} pvemailforward vzdump.bash-completion pvestatd.bash-completion

	perl -I.. -T -e "use PVE::CLI::vzdump; PVE::CLI::vzdump->verify_api();"
	perl -I.. ./pvesh verifyapi
	install -d ${BINDIR}
	install -m 0755 ${SCRIPTS} ${BINDIR}
	install -s -m 2755 -g www-data pvemailforward ${BINDIR}
	install -d ${MAN1DIR}
	install -m 0644 ${MANS} ${MAN1DIR}
	install -d ${PODDIR}
	install -m 0644 vzdump.1.pod ${PODDIR}
	install -m 0644 pvesubscription.1.pod ${PODDIR}
	install -m 0644 -D vzdump.bash-completion ${BASHCOMPLDIR}/vzdump
	install -m 0644 -D pvestatd.bash-completion ${BASHCOMPLDIR}/pvestatd
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	rm -rf *~ ${MANS} *.1.pod pvemailforward *.bash-completion
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
