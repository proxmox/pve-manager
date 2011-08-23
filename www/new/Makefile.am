include $(top_builddir)/common.mk

JSSRC= 				                 	\
	PVEUtils.js					\
	StateProvider.js				\
	VNCConsole.js					\
	data/TimezoneStore.js				\
	data/reader/JsonObject.js			\
	data/PVEProxy.js				\
	data/UpdateQueue.js				\
	data/UpdateStore.js				\
	data/DiffStore.js				\
	data/ObjectStore.js				\
	data/ResourceStore.js				\
	form/Checkbox.js				\
	form/TextField.js				\
	form/RRDTypeSelector.js				\
	form/ComboGrid.js				\
	form/NetworkCardSelector.js			\
	form/DiskFormatSelector.js			\
	form/BusTypeSelector.js				\
	form/RealmComboBox.js				\
	form/BondModeSelector.js			\
	form/ViewSelector.js				\
	form/NodeSelector.js				\
	form/FileSelector.js				\
	form/StorageSelector.js				\
	dc/Tasks.js				\
	dc/Log.js					\
	panel/StatusPanel.js				\
	panel/RRDView.js				\
	window/LoginWindow.js				\
	window/TaskViewer.js				\
	window/Wizard.js				\
	grid/SelectFeature.js				\
	grid/ObjectGrid.js				\
	grid/ResourceGrid.js				\
	tree/ResourceTree.js				\
	panel/ConfigPanel.js				\
	node/DNSEdit.js					\
	node/DNSView.js					\
	node/TimeView.js				\
	node/TimeEdit.js				\
	node/StatusView.js				\
	node/Summary.js					\
	node/ServiceView.js				\
	node/NetworkEdit.js				\
	node/NetworkView.js				\
	node/Syslog.js					\
	node/Tasks.js					\
	node/Config.js					\
	qemu/StatusView.js				\
	qemu/Summary.js					\
	qemu/Config.js					\
	qemu/HardwareView.js				\
	qemu/CreateWizard.js				\
	openvz/CreateWizard.js				\
	storage/Browser.js				\
	dc/UserView.js					\
	dc/GroupView.js					\
	dc/RoleView.js					\
	dc/ACLView.js					\
	dc/AuthView.js					\
	dc/Config.js					\
	Workspace.js

pvemanagerlib.js: ${JSSRC}
	cat ${JSSRC} >$@

pvelib_DATA = pvemanagerlib.js
pvelibdir = ${WWW_EXTDIR}

privatedir = ${WWW_BASEDIR}
private_SCRIPTS = 		\
	startup.pl

managerdir = ${WWW_ROOTDIR}
manager_SCRIPTS = 		\
	index.pl

install-data-hook: 
	chown -R www-data:www-data ${DESTDIR}/${privatedir}
	chown -R www-data:www-data ${DESTDIR}/${managerdir}
	chown -R www-data:www-data ${DESTDIR}/${pvelibdir}

clean-local:
	-rm -rf *~ store/*~ pvemanagerlib.js


