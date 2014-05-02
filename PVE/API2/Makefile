include ../../defines.mk

PERLSOURCE = 			\
	Ceph.pm			\
	APT.pm			\
	Subscription.pm		\
	VZDump.pm		\
	Backup.pm		\
	Cluster.pm		\
	HAConfig.pm		\
	Nodes.pm		\
	Pool.pm			\
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
	make -C Formatter install
