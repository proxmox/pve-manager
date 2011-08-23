/*jslint confusion: true */
Ext.define('PVE.qemu.Options', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.PVE.qemu.Options'],

    initComponent : function() {
	var me = this;
	var i;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var rows = {
	    name: {
		required: true,
		defaultValue: me.pveSelNode.data.name,
		header: 'Name',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'VM name',
		    items: {
			xtype: 'textfield',
			name: 'name',
			value: '',
			fieldLabel: 'VM name',
			allowBlank: true
		    }
		}
	    },
	    onboot: {
		header: 'Start at boot',
		defaultValue: '',
		renderer: PVE.Utils.format_boolean_with_default,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Start at boot',
		    items: {
			xtype: 'booleanfield',
			name: 'onboot',
			value: '',
			fieldLabel: 'Start at boot'
		    }
		}
	    },
	    ostype: {
		header: 'OS Type',
		editor: 'PVE.qemu.OSTypeEdit',
		renderer: PVE.Utils.render_kvm_ostype,
		defaultValue: 'other'
	    },
	    bootdisk: {
		visible: false
	    },
	    boot: {
		header: 'Boot order',
		defaultValue: 'cad',
		editor: 'PVE.qemu.BootOrderEdit',
		renderer: function(order) {
		    var i;
		    var text = '';
		    var bootdisk = me.getObjectValue('bootdisk');
		    order = order || 'cad';
		    for (i = 0; i < order.length; i++) {
			var sel = order.substring(i, i + 1);
			if (text) {
			    text += ', ';
			}
			if (sel === 'c') {
			    if (bootdisk) {
				text += "Disk '" + bootdisk + "'";
			    } else {
				text += "Disk";
			    }
			} else if (sel === 'n') {
			    text += 'Network';
			} else if (sel === 'a') {
			    text += 'Floppy';
			} else if (sel === 'd') {
			    text += 'CD-ROM';
			} else {
			    text += sel;
			}
		    }
		    return text;
		}
	    },
	    acpi: {
		header: 'ACPI support',
		defaultValue: true,
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'ACPI support',
		    items: {
			xtype: 'pvecheckbox',
			name: 'acpi',
			checked: true,
			uncheckedValue: 0,
			defaultValue: 1,
			deleteDefaultValue: true,
			fieldLabel: 'Enable'
		    }
		}
	    },
	    kvm: {
		header: 'KVM hardware virtualization',
		defaultValue: true,
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'KVM hardware virtualization',
		    items: {
			xtype: 'pvecheckbox',
			name: 'kvm',
			checked: true,
			uncheckedValue: 0,
			defaultValue: 1,
			deleteDefaultValue: true,
			fieldLabel: 'Enable'
		    }
		}
	    },
	    freeze: {
		header: 'Freeze CPU at startup',
		defaultValue: false,
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Freeze CPU at startup',
		    items: {
			xtype: 'pvecheckbox',
			name: 'freeze',
			uncheckedValue: 0,
			defaultValue: 0,
			deleteDefaultValue: true,
			labelWidth: 140,
			fieldLabel: 'Freeze CPU at startup'
		    }
		}
	    },
	    localtime: {
		header: 'Use local time for RTC',
		defaultValue: false,
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Use local time for RTC',
		    items: {
			xtype: 'pvecheckbox',
			name: 'localtime',
			uncheckedValue: 0,
			defaultValue: 0,
			deleteDefaultValue: true,
			labelWidth: 140,
			fieldLabel: 'Use local time for RTC'
		    }
		}

	    },
	    startdate: {
		header: 'RTC start date',
		defaultValue: 'now',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'RTC start date',
		    items: {
			xtype: 'pvetextfield',
			name: 'startdate',
			deleteEmpty: true,
			value: 'now',
			fieldLabel: 'RTC start date',
			vtype: 'QemuStartDate',
			allowBlank: true
		    }
		}
	    }
	};

	var baseurl = 'nodes/' + nodename + '/qemu/' + vmid + '/config';

	var reload = function() {
	    me.rstore.load();
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var rowdef = rows[rec.data.key];
	    if (!rowdef.editor) {
		return;
	    }

	    var win;
	    if (Ext.isString(rowdef.editor)) {
		win = Ext.create(rowdef.editor, {
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		});
	    } else {
		var config = Ext.apply({
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		}, rowdef.editor);
		win = Ext.createWidget(rowdef.editor.xtype, config);
		win.load();
	    }

	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		edit_btn.disable();
		return;
	    }
	    var rowdef = rows[rec.data.key];
	    edit_btn.setDisabled(!rowdef.editor);
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/qemu/" + vmid + "/config",
	    cwidth1: 150,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();

	me.on('show', reload);
    }
});

