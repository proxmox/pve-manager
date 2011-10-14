include ../../defines.mk

PERLSOURCE = 			\
	VZDump.pm		\
	Cluster.pm		\
	Nodes.pm		\
	Tasks.pm		\
	Network.pm		\
	Services.pm		\
	OpenVZ.pm

all:

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2
