include ../../defines.mk

SUBDIRS=Hardware Ceph Cluster

PERLSOURCE = 			\
	Replication.pm		\
	ReplicationConfig.pm	\
	Ceph.pm			\
	APT.pm			\
	Subscription.pm		\
	VZDump.pm		\
	Backup.pm		\
	BackupInfo.pm		\
	Cluster.pm		\
	HAConfig.pm		\
	Nodes.pm		\
	Pool.pm			\
	Tasks.pm		\
	Network.pm		\
	Certificates.pm		\
	ACME.pm			\
	ACMEAccount.pm		\
	ACMEPlugin.pm		\
	NodeConfig.pm		\
	Hardware.pm		\
	Services.pm

all:

.PHONY: clean
clean:
	rm -rf *~
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
