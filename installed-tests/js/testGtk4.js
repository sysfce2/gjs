imports.gi.versions.Gtk = '4.0';

const ByteArray = imports.byteArray;
const {GLib, Gio, GObject, Gtk} = imports.gi;
const System = imports.system;

// This is ugly here, but usually it would be in a resource
function createTemplate(className) {
    return `
<interface>
  <template class="${className}" parent="GtkGrid">
    <property name="margin_top">10</property>
    <property name="margin_bottom">10</property>
    <property name="margin_start">10</property>
    <property name="margin_end">10</property>
    <child>
      <object class="GtkLabel" id="label-child">
        <property name="label">Complex!</property>
        <signal name="copy-clipboard" handler="templateCallback" swapped="no"/>
      </object>
    </child>
    <child>
      <object class="GtkLabel" id="label-child2">
        <property name="label">Complex as well!</property>
        <signal name="copy-clipboard" handler="boundCallback" object="label-child" swapped="no"/>
      </object>
    </child>
    <child>
      <object class="GtkLabel" id="internal-label-child">
        <property name="label">Complex and internal!</property>
      </object>
    </child>
  </template>
</interface>`;
}

const MyComplexGtkSubclass = GObject.registerClass({
    Template: ByteArray.fromString(createTemplate('Gjs_MyComplexGtkSubclass')),
    Children: ['label-child', 'label-child2'],
    InternalChildren: ['internal-label-child'],
    CssName: 'complex-subclass',
}, class MyComplexGtkSubclass extends Gtk.Grid {
    templateCallback(widget) {
        this.callbackEmittedBy = widget;
    }

    boundCallback(widget) {
        widget.callbackBoundTo = this;
    }
});

// Sadly, putting this in the body of the class will prevent calling
// get_template_child, since MyComplexGtkSubclass will be bound to the ES6
// class name without the GObject goodies in it
MyComplexGtkSubclass.prototype.testChildrenExist = function () {
    this._internalLabel = this.get_template_child(MyComplexGtkSubclass, 'label-child');
    expect(this._internalLabel).toEqual(jasmine.anything());

    expect(this.label_child2).toEqual(jasmine.anything());
    expect(this._internal_label_child).toEqual(jasmine.anything());
};

const MyComplexGtkSubclassFromResource = GObject.registerClass({
    Template: 'resource:///org/gjs/jsunit/complex4.ui',
    Children: ['label-child', 'label-child2'],
    InternalChildren: ['internal-label-child'],
}, class MyComplexGtkSubclassFromResource extends Gtk.Grid {
    testChildrenExist() {
        expect(this.label_child).toEqual(jasmine.anything());
        expect(this.label_child2).toEqual(jasmine.anything());
        expect(this._internal_label_child).toEqual(jasmine.anything());
    }

    templateCallback(widget) {
        this.callbackEmittedBy = widget;
    }

    boundCallback(widget) {
        widget.callbackBoundTo = this;
    }
});

const [templateFile, stream] = Gio.File.new_tmp(null);
const baseStream = stream.get_output_stream();
const out = new Gio.DataOutputStream({baseStream});
out.put_string(createTemplate('Gjs_MyComplexGtkSubclassFromFile'), null);
out.close(null);

const MyComplexGtkSubclassFromFile = GObject.registerClass({
    Template: templateFile.get_uri(),
    Children: ['label-child', 'label-child2'],
    InternalChildren: ['internal-label-child'],
}, class MyComplexGtkSubclassFromFile extends Gtk.Grid {
    testChildrenExist() {
        expect(this.label_child).toEqual(jasmine.anything());
        expect(this.label_child2).toEqual(jasmine.anything());
        expect(this._internal_label_child).toEqual(jasmine.anything());
    }

    templateCallback(widget) {
        this.callbackEmittedBy = widget;
    }

    boundCallback(widget) {
        widget.callbackBoundTo = this;
    }
});

const SubclassSubclass = GObject.registerClass(
    class SubclassSubclass extends MyComplexGtkSubclass {});

function validateTemplate(description, ClassName, pending = false) {
    let suite = pending ? xdescribe : describe;
    suite(description, function () {
        let win, content;
        beforeEach(function () {
            win = new Gtk.Window();
            content = new ClassName();
            content.label_child.emit('copy-clipboard');
            content.label_child2.emit('copy-clipboard');
            win.add(content);
        });

        it('sets up internal and public template children', function () {
            content.testChildrenExist();
        });

        it('sets up public template children with the correct widgets', function () {
            expect(content.label_child.get_label()).toEqual('Complex!');
            expect(content.label_child2.get_label()).toEqual('Complex as well!');
        });

        it('sets up internal template children with the correct widgets', function () {
            expect(content._internal_label_child.get_label())
                .toEqual('Complex and internal!');
        });

        it('connects template callbacks to the correct handler', function () {
            expect(content.callbackEmittedBy).toBe(content.label_child);
        });

        it('binds template callbacks to the correct object', function () {
            expect(content.label_child2.callbackBoundTo).toBe(content.label_child);
        });

        afterEach(function () {
            win.destroy();
        });
    });
}

describe('Gtk overrides', function () {
    beforeAll(function () {
        Gtk.init();
    });

    afterAll(function () {
        templateFile.delete(null);
    });

    validateTemplate('UI template', MyComplexGtkSubclass);
    validateTemplate('UI template from resource', MyComplexGtkSubclassFromResource);
    validateTemplate('UI template from file', MyComplexGtkSubclassFromFile);
    validateTemplate('Class inheriting from template class', SubclassSubclass, true);

    it('sets CSS names on classes', function () {
        expect(Gtk.Widget.get_css_name.call(MyComplexGtkSubclass)).toEqual('complex-subclass');
    });

    it('avoid crashing when GTK vfuncs are called in garbage collection', function () {
        GLib.test_expect_message('Gjs', GLib.LogLevelFlags.LEVEL_CRITICAL,
            '*during garbage collection*');
        GLib.test_expect_message('Gjs', GLib.LogLevelFlags.LEVEL_CRITICAL,
            '*destroy*');

        let BadLabel = GObject.registerClass(class BadLabel extends Gtk.Label {
            vfunc_destroy() {}
        });

        let w = new Gtk.Window();
        w.add(new BadLabel());

        w.destroy();
        System.gc();

        GLib.test_assert_expected_messages_internal('Gjs', 'testGtk4.js', 0,
            'Gtk overrides avoid crashing and print a stack trace');
    });

    it('can create a Gtk.TreeIter with accessible stamp field', function () {
        const iter = new Gtk.TreeIter();
        iter.stamp = 42;
        expect(iter.stamp).toEqual(42);
    });
});