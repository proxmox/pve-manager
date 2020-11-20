Ext.define('PVE.qemu.PCIInputPanel', {
    extend: 'Proxmox.panel.InputPanel',

    onlineHelp: 'qm_pci_passthrough',

    setVMConfig: function(vmconfig) {
	var me = this;
	me.vmconfig = vmconfig;

	var hostpci = me.vmconfig[me.confid] || '';

	var values = PVE.Parser.parsePropertyString(hostpci, 'host');
	if (values.host) {
	    if (!values.host.match(/^[0-9a-f]{4}:/i)) { // add optional domain
		values.host = "0000:" + values.host;
	    }
	    if (values.host.length < 11) { // 0000:00:00 format not 0000:00:00.0
		values.host += ".0";
		values.multifunction = true;
	    }
	}

	values['x-vga'] = PVE.Parser.parseBoolean(values['x-vga'], 0);
	values.pcie = PVE.Parser.parseBoolean(values.pcie, 0);
	values.rombar = PVE.Parser.parseBoolean(values.rombar, 1);

	me.setValues(values);
	if (!me.vmconfig.machine || me.vmconfig.machine.indexOf('q35') === -1) {
	    // machine is not set to some variant of q35, so we disable pcie
	    var pcie = me.down('field[name=pcie]');
	    pcie.setDisabled(true);
	    pcie.setBoxLabel(gettext('Q35 only'));
	}

	if (values.romfile) {
	    me.down('field[name=romfile]').setVisible(true);
	}
    },

    onGetValues: function(values) {
	var me = this;
	var ret = {};
	if(!me.confid) {
	    var i;
	    for (i = 0; i < 5; i++) {
		if (!me.vmconfig['hostpci' +  i.toString()]) {
		    me.confid = 'hostpci' + i.toString();
		    break;
		}
	    }
	}
	// remove optional '0000' domain
	if (values.host.substring(0,5) === '0000:') {
	    values.host = values.host.substring(5);
	}
	if (values.multifunction) {
	    // modify host to skip the '.X'
	    values.host = values.host.substring(0, values.host.indexOf('.'));
	    delete values.multifunction;
	}

	if (values.rombar) {
	    delete values.rombar;
	} else {
	    values.rombar = 0;
	}

	if (!values.romfile) {
	    delete values.romfile;
	}

	ret[me.confid] = PVE.Parser.printPropertyString(values, 'host');
	return ret;
    },

    initComponent: function() {
	var me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.column1 = [
	    {
		xtype: 'pvePCISelector',
		fieldLabel: gettext('Device'),
		name: 'host',
		nodename: me.nodename,
		allowBlank: false,
		onLoadCallBack: function(store, records, success) {
		    if (!success || !records.length) {
			return;
		    }

		    if (records.every((val) => val.data.iommugroup === -1)) {
			// no iommu groups
			var warning = Ext.create('Ext.form.field.Display', {
			    columnWidth: 1,
			    padding: '0 0 10 0',
			    value: 'No IOMMU detected, please activate it.' +
				   'See Documentation for further information.',
			    userCls: 'pmx-hint'
			});
			me.items.insert(0, warning);
			me.updateLayout(); // insert does not trigger that
		    }
		},
		listeners: {
		    change: function(pcisel, value) {
			if (!value) {
			    return;
			}
			var pcidev = pcisel.getStore().getById(value);
			var mdevfield = me.down('field[name=mdev]');
			mdevfield.setDisabled(!pcidev || !pcidev.data.mdev);
			if (!pcidev) {
			    return;
			}
			var id = pcidev.data.id.substring(0,5); // 00:00
			var iommu = pcidev.data.iommugroup;
			// try to find out if there are more devices
			// in that iommu group
			if (iommu !== -1) {
			    var count = 0;
			    pcisel.getStore().each(function(record) {
				if (record.data.iommugroup === iommu &&
				    record.data.id.substring(0,5) !== id)
				{
				    count++;
				    return false;
				}
			    });
			    var warning = me.down('#iommuwarning');
			    if (count && !warning) {
				warning = Ext.create('Ext.form.field.Display', {
				    columnWidth: 1,
				    padding: '0 0 10 0',
				    itemId: 'iommuwarning',
				    value: 'The selected Device is not in a seperate' +
					   'IOMMU group, make sure this is intended.',
				    userCls: 'pmx-hint'
				});
				me.items.insert(0, warning);
				me.updateLayout(); // insert does not trigger that
			    } else if (!count && warning) {
				me.remove(warning);
			    }
			}
			if (pcidev.data.mdev) {
			    mdevfield.setPciID(value);
			}
		    }
		}
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('All Functions'),
		name: 'multifunction'
	    }
	];

	me.column2 = [
	    {
		xtype: 'pveMDevSelector',
		name: 'mdev',
		disabled: true,
		fieldLabel: gettext('MDev Type'),
		nodename: me.nodename,
		listeners: {
		    change: function(field, value) {
			var mf = me.down('field[name=multifunction]');
			if (!!value) {
			    mf.setValue(false);
			}
			mf.setDisabled(!!value);
		    }
		}
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Primary GPU'),
		name: 'x-vga'
	    }
	];

	me.advancedColumn1 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: 'ROM-Bar',
		name: 'rombar'
	    },
	    {
		xtype: 'displayfield',
		submitValue: true,
		hidden: true,
		fieldLabel: 'ROM-File',
		name: 'romfile'
	    }
	];

	me.advancedColumn2 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: 'PCI-Express',
		name: 'pcie'
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.PCIEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    isAdd: true,

    subject: gettext('PCI Device'),


    initComponent : function() {
	var me = this;

	me.isCreate = !me.confid;

	var ipanel = Ext.create('PVE.qemu.PCIInputPanel', {
	    confid: me.confid,
	    pveSelNode: me.pveSelNode
	});

	Ext.apply(me, {
	    items: [ ipanel ]
	});

	me.callParent();

	me.load({
	    success: function(response) {
		ipanel.setVMConfig(response.result.data);
	    }
	});
    }
});
